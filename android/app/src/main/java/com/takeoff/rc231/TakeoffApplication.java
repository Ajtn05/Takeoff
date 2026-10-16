package com.takeoff.rc231;

import android.app.Application;
import android.content.Context;

public final class TakeoffApplication extends Application {
    private DjiRemote remote;

    @Override protected void attachBaseContext(Context context) {
        super.attachBaseContext(context);
        com.cySdkyc.clx.Helper.install(this);
    }

    public DjiRemote remote() {
        if (remote == null) remote = new DjiRemote(this);
        return remote;
    }
}
