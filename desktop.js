(() => {
  const invoke = window.__TAURI__?.core?.invoke;
  if (typeof invoke !== "function") return;

  invoke("desktop_build_info")
    .then((info) => {
      const mark = document.querySelector(".origin-mark");
      if (!mark || !info?.channel) return;
      mark.dataset.desktopBuild = info.channel;
      mark.setAttribute("title", `${info.product} ${info.version} / ${info.channel}`);
    })
    .catch(() => {
      // Desktop metadata is cosmetic; the game should still launch if IPC is unavailable.
    });
})();
