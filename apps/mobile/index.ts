import { registerRootComponent } from "expo";
import App from "./src/App";
import DesignPreview from "./src/preview/DesignPreview";
registerRootComponent(__DEV__ && process.env.EXPO_PUBLIC_DS_BOT_DESIGN_PREVIEW === "1" ? DesignPreview : App);
