import { render } from "solid-js/web";

import { App } from "./app/app";

const app_root = document.getElementById("app");

if (app_root === null) {
  throw new Error("Super Bowling requires an #app root element.");
}

render(App, app_root);
