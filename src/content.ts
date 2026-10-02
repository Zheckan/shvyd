import { createClient } from "./client";
import { mountTranslator } from "./popup";

mountTranslator(createClient(request => chrome.runtime.sendMessage(request)));
