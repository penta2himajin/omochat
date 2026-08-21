package com.penta2himajin.omochat.companion

import android.content.Context
import com.google.ai.edge.litertlm.ToolProvider
import com.google.ai.edge.litertlm.tool

object DeviceToolSets {
    fun providers(context: Context): List<ToolProvider> {
        val appContext = context.applicationContext
        return listOf(
            tool(DeviceTimeToolSet()),
            tool(CalendarToolSet(CalendarRepository(appContext))),
        )
    }
}
