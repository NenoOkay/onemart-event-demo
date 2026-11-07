package com.onemart.eventdemo;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SunmiPrinterPlugin.class); // local plugin: must register before super.onCreate
        super.onCreate(savedInstanceState);
    }
}
