// Opens a visible Microsoft Edge window with the helper's own profile so Elena
// can log in to Mercadona once; it closes by itself when the session exists.
import { mercadonaLoggedIn, openMercadona } from "./helper.mjs";

const { context, page } = await openMercadona({ headless: false });
try {
  console.log("Inicia sesión en Mercadona en la ventana que se ha abierto…");
  const deadline = Date.now() + 10 * 60_000;
  let loggedIn = await mercadonaLoggedIn(page);
  while (!loggedIn && Date.now() < deadline) {
    await page.waitForTimeout(2_000);
    loggedIn = await page.evaluate(() => !!localStorage.getItem("MO-user")).catch(() => false);
  }
  console.log(loggedIn ? "Sesión de Mercadona guardada. Ya puedes cerrar esta ventana." : "No se detectó el inicio de sesión.");
  await page.waitForTimeout(3_000);
} finally {
  await context.close().catch(() => {});
}
