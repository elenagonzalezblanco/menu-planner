# Mercadona helper for the Mac

Mercadona rejects requests coming from servers, so Mi Cocina's
**Rellena la cesta automática** button only queues a request
(`POST /api/mercadona/cart-requests`). This helper runs in the background on
the owner's Mac, claims the request
(`POST /api/mercadona-connector/requests/claim`), opens tienda.mercadona.es in
a headless Microsoft Edge with its own logged-in profile and runs the same
connector as the bookmark (`mercadona-connector.js`, `fulfil()`), which fills
the cart and reports the outcome back to the shopping list. It never orders or
pays. Once a day it opens Mercadona so the site can refresh its session.

## Install

```sh
H="$HOME/Library/Application Support/MiCocinaMercadona"
mkdir -p "$H" && cp helper.mjs login.mjs package.json "$H/" && (cd "$H" && npm install)
# config.json (chmod 600): {"api": "https://micocina.azurewebsites.net", "token": "<connector token>", "headless": true}
# The token is created with «Conectar con Mercadona» on the app's Mercadona page.
(cd "$H" && node login.mjs)          # log in to Mercadona once in the window that opens
sed "s#\$HOME#$HOME#g" com.elenagbg.micocina-mercadona.plist.template > ~/Library/LaunchAgents/com.elenagbg.micocina-mercadona.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.elenagbg.micocina-mercadona.plist
```

## Operate

- Status: `launchctl print gui/$(id -u)/com.elenagbg.micocina-mercadona | grep state`
- Log: `~/Library/Logs/MiCocinaMercadona.log`
- Restart: `launchctl kickstart -k gui/$(id -u)/com.elenagbg.micocina-mercadona`
- Mercadona session expired (the shopping list says so): stop the agent
  (`launchctl bootout gui/$(id -u)/com.elenagbg.micocina-mercadona`), run
  `node login.mjs` in the install folder, then bootstrap the agent again.
- Uninstall: bootout the agent, delete the plist and the install folder.

Mercadona's search rejects the `HeadlessEdg` user agent, so the helper presents
the installed Edge version as a normal browser.
