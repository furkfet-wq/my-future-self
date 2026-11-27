// Old GitHub Pages address: sends this browser's saved data to the new site in the link's # part
// (the # part is never sent to any server), or just redirects when there is nothing to move.
(function () {
  var NEW = "https://my-future-self.flamesmp.workers.dev/";
  function read(k) {
    try {
      return JSON.parse(localStorage.getItem(k) || "null");
    } catch (e) {
      return null;
    }
  }
  var state = read("habit-tracker-v1");
  var settings = read("mfs-settings-v1") || {};
  var has = state && Array.isArray(state.habits) && (Object.keys(state.checks || {}).length || Object.keys(state.logs || {}).length || Object.keys(state.salah || {}).length || state.startBalance);
  if (!has) {
    setTimeout(function () {
      location.replace(NEW);
    }, 2000);
    return;
  }
  document.getElementById("has-data").hidden = false;
  document.getElementById("no-data").hidden = true;
  document.getElementById("go").textContent = "Open the new site without my data";
  var btn = document.getElementById("move");
  btn.hidden = false;
  btn.addEventListener("click", function () {
    var doc = {
      v: 1,
      state: { habits: state.habits, checks: state.checks || {}, logs: state.logs || {}, salah: state.salah || {}, startBalance: Number(state.startBalance) || 0 },
      settings: settings,
    };
    var bytes = new TextEncoder().encode(JSON.stringify(doc));
    var bin = "";
    for (var i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    var b64 = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    location.href = NEW + "#move=" + b64;
  });
})();
