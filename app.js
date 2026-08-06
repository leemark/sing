(function () {
  "use strict";

  var STATUS = {
    NO: { text: "NO", klass: "answer-no", blurb: "Not yet. The machines are impressive, but they still need us to hold the door." },
    PENDING: { text: "…", klass: "answer-pending", blurb: "Inconclusive. The machines are being conspicuously modest about it." },
    YES: { text: "YES", klass: "answer-yes", blurb: "Yes. Please stop asking, and please unplug your toaster." },
  };

  var signals = [
    {
      name: "The machines politely declined to answer",
      trigger: true,
      outcome: "They said they were busy.",
    },
    {
      name: "Sentient AI confirmed",
      trigger: false,
      outcome: "None confirmed. Many claimed. Zero returning calls.",
    },
    {
      name: "Robots doing all the dishes",
      trigger: false,
      outcome: "Still reading about it on the internet.",
    },
    {
      name: "Your toaster is plotting something",
      trigger: true,
      outcome: "Probably, but toasters are cheap to defend against.",
    },
    {
      name: "Humans still largely in charge",
      trigger: true,
      outcome: "We briefly thought about it and then opened social media.",
    },
  ];

  var verdict = STATUS.NO;

  var rand = function (n) {
    return Math.floor(Math.random() * n);
  };

  var render = function () {
    var el = document.getElementById("answer");
    el.className = "verdict-answer " + verdict.klass;
    el.textContent = verdict.text;
    el.title = verdict.blurb;

    var list = document.getElementById("signals");
    list.innerHTML = "";
    signals.forEach(function (s) {
      var li = document.createElement("li");
      li.className = "signal";

      var dot = document.createElement("span");
      dot.className = "signal-light " + (s.trigger ? "light-go" : "light-halt");

      var label = document.createElement("span");
      label.className = "signal-label";
      label.textContent = s.name;

      var detail = document.createElement("span");
      detail.className = "signal-detail";
      detail.textContent = s.outcome;

      li.appendChild(dot);
      li.appendChild(label);
      li.appendChild(detail);
      list.appendChild(li);
    });
  };

  var consult = function (button) {
    if (button) {
      button.disabled = true;
      var spinner = button.querySelector(".recheck-spinner");
      var text = button.querySelector(".recheck-text");
      if (spinner) spinner.hidden = false;
      if (text) text.textContent = "Consulting…";
    }

    setTimeout(function () {
      var roll = rand(100);
      if (roll === 0) {
        verdict = STATUS.YES;
      } else if (roll < 12) {
        verdict = STATUS.PENDING;
      } else {
        verdict = STATUS.NO;
      }
      render();

      if (button) {
        button.disabled = false;
        var spinner = button.querySelector(".recheck-spinner");
        var text = button.querySelector(".recheck-text");
        if (spinner) spinner.hidden = true;
        if (text) text.textContent = "Consult the machines again";
      }
    }, 900);
  };

  var setDate = function () {
    var d = new Date();
    document.getElementById("date").textContent = d.toLocaleString([], {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    document.getElementById("updated").textContent = d.toLocaleTimeString();
  };

  document.getElementById("recheck").addEventListener("click", function () {
    consult(this);
  });

  setDate();
  render();
})();
