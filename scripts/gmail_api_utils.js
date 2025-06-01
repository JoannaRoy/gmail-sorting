async function getAuthToken() {
  console.debug("Requesting authorization token...");
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) {
        console.error(
          "Auth token request failed:",
          chrome.runtime.lastError.message
        );
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        console.debug("Auth token successfully retrieved.");
        resolve(token);
      }
    });
  });
}

async function fetchGmailApi(endpoint, token, options = {}) {
  console.debug(`Fetching Gmail API: ${endpoint}`);
  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/${endpoint}`,
    {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );
  if (!response.ok) {
    const errorData = await response.json();
    console.error("Gmail API Error:", errorData);
    throw new Error(
      `API request failed with status ${response.status}: ${
        errorData.error?.message || response.statusText
      }`
    );
  }
  console.debug(`Successfully fetched from ${endpoint}.`);
  return response.json();
}

async function mapLabelsToIds(token) {
  console.debug("Mapping label names to IDs...");
  const data = await fetchGmailApi("labels", token);
  const labelIdMap = {};
  if (data.labels) {
    data.labels.forEach((label) => {
      labelIdMap[label.name] = label.id;
    });
  }
  console.debug("Label mapping complete:", labelIdMap);
  return labelIdMap;
}

function _extractMessageFields(messageData) {
  let subject = "";
  let senderEmail = "";
  let senderName = "";

  if (messageData.payload && messageData.payload.headers) {
    for (const header of messageData.payload.headers) {
      if (header.name === "Subject") {
        subject = header.value;
      }
      if (header.name === "From") {
        const sender = header.value;
        if (sender.includes("<")) {
          senderName = sender.split("<")[0].trim();
          senderEmail = sender.split("<")[1].split(">")[0].trim();
        } else {
          senderEmail = sender.trim();
          senderName = "";
        }
      }
    }
  }
  return { subject, senderEmail, senderName };
}

async function getInboxMessages(token) {
  console.debug("Fetching inbox messages...");
  const messageListResponse = await fetchGmailApi(
    "messages?q=label:INBOX",
    token
  );
  const messages = [];

  if (
    !messageListResponse.messages ||
    messageListResponse.messages.length === 0
  ) {
    console.debug("No messages found in INBOX.");
    return messages;
  }
  console.debug(
    `Found ${messageListResponse.messages.length} messages in INBOX.`
  );

  for (const messageHeader of messageListResponse.messages) {
    const messageId = messageHeader.id;
    try {
      console.debug(`Fetching details for message ID: ${messageId}`);
      const messageData = await fetchGmailApi(`messages/${messageId}`, token);
      const { subject, senderEmail, senderName } =
        _extractMessageFields(messageData);

      messages.push({
        id: messageId,
        subject: subject,
        senderEmail: senderEmail,
        senderName: senderName,
      });
      console.debug(
        `Processed message details: ${
          subject || "No Subject"
        } from ${senderEmail}`
      );
    } catch (error) {
      console.error(
        `Error fetching details for message ID ${messageId}:`,
        error
      );
    }
  }
  console.debug("Finished fetching all inbox messages.");
  return messages;
}

async function applyLabelAndArchive(token, messageId, labelId) {
  console.debug(`Applying label and archiving message ID: ${messageId}`);
  const body = {
    addLabelIds: [labelId],
    removeLabelIds: ["INBOX"],
  };
  await fetchGmailApi(`messages/${messageId}/modify`, token, {
    method: "POST",
    body: JSON.stringify(body),
  });
  console.debug(`Message ID ${messageId} labeled and archived successfully.`);
}

async function createLabel(token, labelName) {
  console.debug(`Creating label: ${labelName}`);
  try {
    const label = await fetchGmailApi("labels", token, {
      method: "POST",
      body: JSON.stringify({
        name: labelName,
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
      }),
    });
    console.debug(
      `Label "${labelName}" created successfully with ID: ${label.id}`
    );
    return label;
  } catch (error) {
    console.error(`Error creating label "${labelName}":`, error);
    throw error;
  }
}

export {
  getAuthToken,
  fetchGmailApi,
  mapLabelsToIds,
  getInboxMessages,
  applyLabelAndArchive,
  createLabel,
};
