package com.bennyjoni.terminator;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.google.android.gms.ads.MobileAds;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        MobileAds.putPublisherFirstPartyIdEnabled(false);
        super.onCreate(savedInstanceState);
    }
}
