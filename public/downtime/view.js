// Simple Karte 障害時の参照: shows the sheet the app last saved in this browser (localStorage), and keeps this
// page available without a network (sw.js, which only controls /downtime/).
(function () {
  "use strict";
  var KEY = "simple-karte:downtime";
  var byId = function (id) {
    return document.getElementById(id);
  };
  var kept = null;
  try {
    kept = JSON.parse(window.localStorage.getItem(KEY) || "null");
  } catch {
    kept = null;
  }
  var status = byId("status");
  var print = byId("print");
  if (!kept || kept.version !== 1 || typeof kept.body !== "string") {
    status.textContent =
      "この端末には、障害時の参照が保存されていません。電子カルテが使えるうちに、場所のプルダウンの「障害時の参照」を開いてください（開くとこの端末に保存されます）。";
  } else {
    var style = document.createElement("style");
    style.textContent = String(kept.css || "");
    document.head.appendChild(style);
    status.textContent =
      String(kept.madeAt) + " 現在の参照（" + String(kept.place) + "・" + String(kept.count) + "人、作成 " + String(kept.by) + "）。この時刻より後の指示・実施は載っていません。";
    // Made by the app with every value escaped; this page's policy (script-src 'self') runs nothing inside it.
    byId("sheet").innerHTML = kept.body;
    print.hidden = false;
  }
  print.addEventListener("click", function () {
    window.print();
  });
  var online = function () {
    byId("online").textContent = navigator.onLine ? "いまはネットワークにつながっています。" : "いまはネットワークにつながっていません（この端末に保存した参照を出しています）。";
  };
  online();
  window.addEventListener("online", online);
  window.addEventListener("offline", online);
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/downtime/sw.js", { scope: "/downtime/" }).catch(function () {});
  }
})();
