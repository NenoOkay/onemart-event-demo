package com.onemart.eventdemo;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.sunmi.peripheral.printer.InnerPrinterCallback;
import com.sunmi.peripheral.printer.InnerPrinterManager;
import com.sunmi.peripheral.printer.InnerResultCallback;
import com.sunmi.peripheral.printer.SunmiPrinterService;

import java.util.concurrent.atomic.AtomicBoolean;

// Sunmi built-in printer (V2s): web side renders the receipt to an image (Thai-safe), this plugin prints it.
// Messages for users are mapped from `state` codes in src/lib/printing/SunmiPrinter.ts.
@CapacitorPlugin(name = "SunmiPrinter")
public class SunmiPrinterPlugin extends Plugin {
    private static final long PRINT_TIMEOUT_MS = 15000;
    private SunmiPrinterService service;

    private final InnerPrinterCallback binder = new InnerPrinterCallback() {
        @Override
        protected void onConnected(SunmiPrinterService s) { service = s; }

        @Override
        protected void onDisconnected() { service = null; }
    };

    @Override
    public void load() {
        try {
            InnerPrinterManager.getInstance().bindService(getContext(), binder);
        } catch (Exception e) {
            service = null; // not a Sunmi device
        }
    }

    @Override
    protected void handleOnDestroy() {
        try { InnerPrinterManager.getInstance().unBindService(getContext(), binder); } catch (Exception ignored) { }
    }

    // state: 1 ready · 2 starting · 3 comm error · 4 out of paper · 5 overheated · 6 cover open · 505 no printer
    private int state() {
        if (service == null) return -1;
        try { return service.updatePrinterState(); } catch (Exception e) { return -1; }
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject res = new JSObject();
        res.put("connected", service != null);
        res.put("state", state());
        call.resolve(res);
    }

    @PluginMethod
    public void printImage(PluginCall call) {
        String b64 = call.getString("base64");
        int feed = call.getInt("feedLines", 3);
        if (b64 == null) { call.reject("missing base64"); return; }

        int st = state();
        if (st != 1) {
            JSObject data = new JSObject();
            data.put("state", st);
            call.reject("printer not ready", "STATE_" + st, data);
            return;
        }

        Bitmap bmp;
        try {
            byte[] bytes = Base64.decode(b64.replaceFirst("^data:image/\\w+;base64,", ""), Base64.DEFAULT);
            bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        } catch (Exception e) {
            bmp = null;
        }
        if (bmp == null) { call.reject("bad image"); return; }

        AtomicBoolean done = new AtomicBoolean(false);
        Handler main = new Handler(Looper.getMainLooper());
        main.postDelayed(() -> {
            if (done.compareAndSet(false, true)) call.reject("print timeout", "TIMEOUT");
        }, PRINT_TIMEOUT_MS);

        try {
            // transaction mode: the result callback reports whether the paper actually came out
            service.enterPrinterBuffer(true);
            service.printBitmap(bmp, null);
            service.lineWrap(feed, null);
            service.exitPrinterBufferWithCallback(true, new InnerResultCallback() {
                @Override public void onRunResult(boolean ok) { }
                @Override public void onReturnString(String s) { }
                @Override public void onRaiseException(int code, String msg) { finish(code, msg); }
                @Override public void onPrintResult(int code, String msg) { finish(code, msg); }

                private void finish(int code, String msg) {
                    if (!done.compareAndSet(false, true)) return;
                    main.removeCallbacksAndMessages(null);
                    if (code == 0) {
                        call.resolve();
                    } else {
                        JSObject data = new JSObject();
                        data.put("state", state());
                        call.reject("print failed: " + code + " " + msg, "PRINT_" + code, data);
                    }
                }
            });
        } catch (Exception e) {
            if (done.compareAndSet(false, true)) {
                main.removeCallbacksAndMessages(null);
                call.reject("print error: " + e.getMessage(), "EXCEPTION");
            }
        }
    }
}
