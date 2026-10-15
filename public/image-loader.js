(() => {
  function url(item) {
    const group = { operator_portrait: "portraits", story_cg: "cg" }[item?.type];
    return group && item.filename ? `/api/v1/images/${group}/${encodeURIComponent(item.filename)}` : item?.url;
  }

  function load(image, item, { priority = "low", onload = () => {}, onerror = () => {} } = {}) {
    image.decoding = "async";
    image.fetchPriority = priority;
    image.onload = onload;
    const cachedUrl = url(item);
    image.onerror = () => {
      // Keep original API URLs usable if the image cache is temporarily unavailable.
      if (image.getAttribute("src") === cachedUrl && cachedUrl !== item.url) image.src = item.url;
      else onerror();
    };
    image.src = cachedUrl;
  }

  function whenNear(element, callback) {
    if (!("IntersectionObserver" in window)) { callback(); return; }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      callback();
    }, { rootMargin: "350px" });
    observer.observe(element);
  }
  window.ArkotoImages = { load, whenNear };
})();
