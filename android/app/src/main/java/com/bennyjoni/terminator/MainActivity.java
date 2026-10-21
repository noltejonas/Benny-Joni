package com.bennyjoni.terminator;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AdPrivacyPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
