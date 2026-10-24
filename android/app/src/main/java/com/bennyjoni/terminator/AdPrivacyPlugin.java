package com.bennyjoni.terminator;

import android.os.Handler;
import android.os.Looper;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.ads.MobileAds;

@CapacitorPlugin(name = "AdPrivacy")
public class AdPrivacyPlugin extends Plugin {
    @PluginMethod
    public void disablePublisherFirstPartyId(PluginCall call) {
        // Google requires initialize() first. JS calls this only after the
        // consent-gated AdMob.initialize() promise, before any ad request.
        new Handler(Looper.getMainLooper()).post(() -> {
            try {
                boolean persisted = MobileAds.putPublisherFirstPartyIdEnabled(false);
                if (!persisted) {
                    call.reject("Publisher first-party ID setting was not persisted");
                    return;
                }
                JSObject result = new JSObject();
                result.put("disabled", true);
                call.resolve(result);
            } catch (Exception error) {
                call.reject("Unable to disable publisher first-party ID", error);
            }
        });
    }
}
