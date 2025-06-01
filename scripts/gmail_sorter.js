import {
  getAuthToken,
  mapLabelsToIds,
  getInboxMessages,
  applyLabelAndArchive,
} from "./gmail_api_utils.js";

async function getLabelSenderMappings() {
  console.debug("Loading label sender mappings from storage...");
  return new Promise((resolve) => {
    chrome.storage.local.get({ labelSenderMappings: {} }, (data) => {
      if (chrome.runtime.lastError) {
        console.error(
          "Error loading labelSenderMappings from storage:",
          chrome.runtime.lastError.message,
          "Using empty mappings."
        );
        resolve({});
      } else {
        console.debug("Label sender mappings loaded successfully.");
        resolve(data.labelSenderMappings || {});
      }
    });
  });
}

export async function processGmailMessages() {
  console.debug("Starting Gmail processing...");
  const processedEmails = [];
  try {
    const token = await getAuthToken();
    if (!token) {
      console.error("Failed to get auth token. Aborting process.");
      return processedEmails;
    }

    const labelNameMap = await mapLabelsToIds(token);
    const idToNameMap = Object.fromEntries(
      Object.entries(labelNameMap).map(([name, id]) => [id, name])
    );

    const messages = await getInboxMessages(token);
    const labelSenderMappings = await getLabelSenderMappings();

    if (messages.length === 0) {
      console.debug("No messages to process. Gmail processing finished.");
      return processedEmails;
    }
    console.debug(`Processing ${messages.length} messages...`);

    if (Object.keys(labelSenderMappings).length === 0) {
      console.debug(
        "No label sender mappings configured. Gmail processing finished."
      );
      return processedEmails;
    }

    for (const message of messages) {
      let appliedRule = false;
      for (const [labelId, senderRules] of Object.entries(
        labelSenderMappings
      )) {
        if (appliedRule) break;

        const labelName = idToNameMap[labelId];
        if (!labelName) {
          console.warn(
            `Label ID "${labelId}" found in mappings but not in fetched Gmail labels. Skipping.`
          );
          continue;
        }

        for (const rule of senderRules) {
          if (
            message.senderEmail.toLowerCase() === rule.senderEmail.toLowerCase()
          ) {
            if (!labelId) {
              console.error(
                `Invalid labelId for rule:`,
                rule,
                `for labelName: ${labelName}`
              );
              continue;
            }

            try {
              console.debug(
                `Applying label "${labelName}" (ID: ${labelId}) to message: ${
                  message.subject || "No Subject"
                } from ${message.senderEmail}`
              );
              await applyLabelAndArchive(token, message.id, labelId);
              console.debug(
                `Labeled "${
                  message.subject || "No Subject"
                }" as ${labelName} and removed from INBOX.`
              );
              processedEmails.push({
                id: message.id,
                subject: message.subject || "No Subject",
                labelApplied: labelName,
              });
              appliedRule = true;
              break;
            } catch (error) {
              console.error(
                `Failed to modify message ${message.id} ("${
                  message.subject || "No Subject"
                }") for label ${labelName}:`,
                error
              );
            }
          }
        }
      }
    }
    console.debug("Gmail processing finished successfully.");
    return processedEmails;
  } catch (error) {
    console.error("An error occurred during Gmail processing:", error);
    return processedEmails;
  }
}
