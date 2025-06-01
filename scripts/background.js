import { processGmailMessages } from "./gmail_sorter.js";

const NOTIFICATION_ICON_URL = "/images/broom_icon_48.png";

function _createNotification(
  idSuffix,
  title,
  message,
  type = "basic",
  items = []
) {
  const notificationId =
    NOTIFICATION_ICON_URL + "_" + idSuffix + "_" + Date.now();
  const options = {
    type: type,
    iconUrl: NOTIFICATION_ICON_URL,
    title: title,
    message: message,
    priority: 1,
  };

  if (type === "list") {
    options.items = items;
  }

  if (title.includes("Error")) {
    options.priority = 2;
  }

  console.debug(`Attempting to show notification (ID: ${notificationId})...`);
  chrome.notifications.create(
    notificationId,
    options,
    (createdNotificationId) => {
      if (chrome.runtime.lastError) {
        console.error(
          `Error showing notification (ID: ${notificationId}):`,
          chrome.runtime.lastError.message
        );
      } else {
        console.debug(`Notification shown, ID: ${createdNotificationId}`);
      }
    }
  );
}

function showStartNotification() {
  _createNotification(
    "start",
    "Gmail Sorter",
    "Starting to clean up your inbox..."
  );
}

function showDoneNotification(processedEmails) {
  let title = "Gmail Sorter - Cleanup Finished";
  let message = "Inbox cleanup complete!";
  let items = [];
  let type = "basic";

  if (processedEmails && processedEmails.length > 0) {
    items = processedEmails.map((email) => ({
      title: email.subject || `Email ID: ${email.id}`,
      message: `Moved to: ${email.labelApplied}`,
    }));
    message = `Processed ${processedEmails.length} email(s). Check details in the list.`;
    type = "list";
  } else if (processedEmails) {
    message = "No emails were processed in this run.";
  } else {
    message = "Cleanup complete. No specific email processing data returned.";
  }
  _createNotification("done", title, message, type, items);
}

function showErrorNotification(errorMessage) {
  _createNotification(
    "error",
    "Gmail Sorter - Error",
    `An error occurred: ${errorMessage}`
  );
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.debug("Message received in background script:", request);
  if (request.action === "cleanupInbox") {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const currentTab = tabs[0];
      if (
        currentTab &&
        currentTab.url &&
        currentTab.url.startsWith("https://mail.google.com")
      ) {
        console.debug("Current tab is Gmail, processing messages...");
        showStartNotification();
        try {
          const processedEmails = await processGmailMessages();
          showDoneNotification(processedEmails);
          sendResponse({ status: "success", processedEmails });
        } catch (error) {
          console.error("Error processing Gmail messages:", error.message);
          showErrorNotification(
            error.message || "Unknown error during processing."
          );
          sendResponse({ status: "error", message: error.toString() });
        }
      } else {
        console.debug(
          "Current tab is not Gmail, or no active tab found. Extension will not run."
        );
        sendResponse({ status: "error", message: "Not on a Gmail page." });
      }
    });
    return true;
  }
});
