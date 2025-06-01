document.addEventListener("DOMContentLoaded", function () {
  const cleanupButton = document.getElementById("cleanupButton");
  const optionsButton = document.getElementById("optionsButton");

  if (cleanupButton) {
    cleanupButton.addEventListener("click", function () {
      console.log("'Clean up inbox' button clicked in popup.");
      chrome.runtime.sendMessage(
        { action: "cleanupInbox" },
        function (response) {
          if (chrome.runtime.lastError) {
            console.error(
              "Error sending message:",
              chrome.runtime.lastError.message
            );
          } else {
            console.log(
              "Message sent to background script, response:",
              response
            );
            window.close();
          }
        }
      );
    });
  } else {
    console.error("Cleanup button not found in popup.html");
  }

  if (optionsButton) {
    optionsButton.addEventListener("click", function () {
      console.log("'Options' button clicked in popup.");
      if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        window.open(chrome.runtime.getURL("displays/options.html"));
      }
      window.close();
    });
  } else {
    console.error("Options button not found in popup.html");
  }
});
