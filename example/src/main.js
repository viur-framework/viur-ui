import "viur-ui/src/webawesomeConfig.js"

import { createApp } from "vue"
import { createPinia } from "pinia"
import { createI18n } from "vue-i18n"
import App from "./App.vue"

import ViForm from "viur-ui/src/forms/ViForm.vue"
import Bone from "viur-ui/src/forms/bones/Bone.vue"
import BoneLabel from "viur-ui/src/forms/bones/BoneLabel.vue"
import BoneActions from "viur-ui/src/forms/bones/BoneActions.vue"
import WrapperNested from "viur-ui/src/forms/bones/BoneNestedWrapper.vue"
import ViFormCategory from "viur-ui/src/forms/ViFormCategory.vue"

const i18n = createI18n({ legacy: false, locale: "de", messages: {} })

const app = createApp(App)
app.use(createPinia())
app.use(i18n)

app.component("ViForm", ViForm)
app.component("vi-form", ViForm)
app.component("Bone", Bone)
app.component("bone", Bone)
app.component("bone-label", BoneLabel)
app.component("bone-actions", BoneActions)
app.component("WrapperNested", WrapperNested)
app.component("wrapper-nested", WrapperNested)
app.component("vi-form-category", ViFormCategory)

app.mount("#app")
