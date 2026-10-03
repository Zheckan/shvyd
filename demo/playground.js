(() => {
  const styles = new Set(["editorial", "technical", "journal", "warm", "forest", "contrast", "neon", "gradient"]);
  const selector = document.getElementById("page-style");
  const requested = new URL(location.href).searchParams.get("style");
  if (requested && styles.has(requested)) document.body.dataset.style = requested;
  selector.value = document.body.dataset.style;
  selector.addEventListener("change", () => {
    document.body.dataset.style = selector.value;
    const url = new URL(location.href); url.searchParams.set("style", selector.value); history.replaceState(null, "", url);
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
