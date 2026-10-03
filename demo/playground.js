(() => {
  const styles = new Set(["editorial", "technical", "journal", "warm", "forest", "contrast", "neon", "gradient"]);
  const selector = document.getElementById("page-style");
  if (location.protocol === "file:") {
    document.getElementById("playground-mode").textContent = "Local HTML test page. In chrome://extensions, reload Shvyd, open Details, enable Allow access to file URLs, then refresh this page. Translation uses the extension's saved settings.";
  }
  const requested = new URL(location.href).searchParams.get("style");
  if (requested && styles.has(requested)) document.body.dataset.style = requested;
  selector.value = document.body.dataset.style;
  selector.addEventListener("change", () => {
    document.body.dataset.style = selector.value;
    if (location.protocol !== "file:") {
      const url = new URL(location.href); url.searchParams.set("style", selector.value); history.replaceState(null, "", url);
    }
    getSelection()?.removeAllRanges();
  });
  for (const button of document.querySelectorAll("[data-select]")) {
    button.addEventListener("click", () => {
      const passage = document.getElementById(button.dataset.select);
      passage.scrollIntoView({ block: "center" });
      const range = document.createRange(); range.selectNodeContents(passage);
      const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    });
  }
})();
