// src/api/devices.js — computers running the desktop app (paths unchanged).
// The implementation stays in uploads.js, which the uploads cards already
// import (and mock in their tests); pages use this module.
export { fetchDevices, renameDevice, assignDeviceSite } from "./uploads";
