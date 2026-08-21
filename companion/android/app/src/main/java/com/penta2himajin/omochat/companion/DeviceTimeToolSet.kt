package com.penta2himajin.omochat.companion

import com.google.ai.edge.litertlm.Tool
import com.google.ai.edge.litertlm.ToolSet

/** On-device clock tool for LiteRT-LM automatic tool calling. */
class DeviceTimeToolSet : ToolSet {
    @Tool(description = "Get the current local date and time on the phone, including time zone.")
    fun getCurrentTime(): String = DeviceTimeFormat.format()
}
