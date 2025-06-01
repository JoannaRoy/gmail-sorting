document.addEventListener("DOMContentLoaded", () => {
  const labelMappingsContainer = document.getElementById(
    "labelMappingsContainer"
  );
  let userLabels = [];
  let currentMappings = {};

  function getAuthToken(interactive) {
    return new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: interactive }, (token) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(token);
        }
      });
    });
  }

  async function fetchGmailLabels(token) {
    try {
      const response = await fetch(
        "https://www.googleapis.com/gmail/v1/users/me/labels",
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      userLabels = (data.labels || []).filter(
        (label) =>
          label.type === "user" ||
          ["INBOX", "SENT", "DRAFTS", "SPAM", "TRASH"].includes(label.id)
      );
      console.debug("Fetched Gmail labels:", userLabels);
      return userLabels;
    } catch (error) {
      console.error("Error fetching Gmail labels:", error);
      alert(
        "Error fetching Gmail labels. Ensure the extension has Gmail permissions and you are logged in. Check console for details."
      );
      return [];
    }
  }

  function saveMappings(mappings) {
    chrome.storage.local.set({ labelSenderMappings: mappings }, () => {
      if (chrome.runtime.lastError) {
        console.error("Error saving mappings:", chrome.runtime.lastError);
        alert("Error saving mappings. See console for details.");
      } else {
        console.debug("Mappings saved successfully.");
        renderLabelMappings();
      }
    });
  }

  function loadStoredMappings() {
    return new Promise((resolve) => {
      chrome.storage.local.get({ labelSenderMappings: {} }, (data) => {
        if (chrome.runtime.lastError) {
          console.error(
            "Error loading stored mappings:",
            chrome.runtime.lastError
          );
          alert(
            "Error loading stored mappings. Using empty. See console for details."
          );
          resolve({});
        } else {
          currentMappings = data.labelSenderMappings || {};
          console.debug("Loaded stored mappings:", currentMappings);
          resolve(currentMappings);
        }
      });
    });
  }

  function buildLabelHierarchy(labels) {
    const hierarchy = {};
    const rootLabels = [];

    labels.forEach((label) => {
      const parts = label.name.split("/");
      if (parts.length === 1) {
        rootLabels.push(label);
      } else {
        const rootName = parts[0];
        if (!hierarchy[rootName]) {
          hierarchy[rootName] = { children: [], rootLabel: null };
        }
        hierarchy[rootName].children.push(label);
      }
    });

    rootLabels.forEach((label) => {
      if (hierarchy[label.name]) {
        hierarchy[label.name].rootLabel = label;
      } else {
        hierarchy[label.name] = { children: [], rootLabel: label };
      }
    });

    return hierarchy;
  }

  function createChevronIcon() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute(
      "class",
      "w-5 h-5 text-gray-500 transition-transform duration-200"
    );
    svg.setAttribute("fill", "none");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("stroke", "currentColor");

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("d", "M9 5l7 7-7 7");

    svg.appendChild(path);
    return svg;
  }

  function createLabelSection(label, indentLevel = 0, hasChildren = false) {
    const labelSectionDiv = document.createElement("div");
    const isNested = indentLevel > 0;

    labelSectionDiv.className = `${
      isNested
        ? "border-l-2 border-gray-200 ml-4 pl-4 mb-2"
        : "border border-gray-200 rounded-lg bg-white shadow-sm mb-4"
    }`;

    const labelToggleHeader = document.createElement("div");
    labelToggleHeader.className = `flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors duration-150 ${
      isNested ? "py-2" : ""
    }`;

    const labelInfo = document.createElement("div");
    labelInfo.className = "flex items-center space-x-3";

    const labelBadge = document.createElement("span");
    const labelDisplayName = label.name.includes("/")
      ? label.name.split("/").pop()
      : label.name;
    labelBadge.className = `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
      isNested ? "bg-gray-100 text-gray-700" : "bg-blue-100 text-blue-800"
    }`;
    labelBadge.textContent = labelDisplayName;
    labelInfo.appendChild(labelBadge);

    const mappingCount = (currentMappings[label.id] || []).length;
    if (mappingCount > 0) {
      const countBadge = document.createElement("span");
      countBadge.className =
        "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700";
      countBadge.textContent = `${mappingCount} rule${
        mappingCount !== 1 ? "s" : ""
      }`;
      labelInfo.appendChild(countBadge);
    }

    labelToggleHeader.appendChild(labelInfo);

    const chevronIcon = createChevronIcon();
    labelToggleHeader.appendChild(chevronIcon);
    labelSectionDiv.appendChild(labelToggleHeader);

    const contentDiv = document.createElement("div");
    contentDiv.className = `${
      isNested ? "hidden" : "border-t border-gray-200 hidden"
    }`;
    labelSectionDiv.appendChild(contentDiv);

    let isExpanded = false;
    labelToggleHeader.addEventListener("click", () => {
      isExpanded = !isExpanded;
      if (isExpanded) {
        contentDiv.classList.remove("hidden");
        chevronIcon.style.transform = "rotate(90deg)";
      } else {
        contentDiv.classList.add("hidden");
        chevronIcon.style.transform = "rotate(0deg)";
      }
    });

    const mappingsList = document.createElement("div");
    mappingsList.className = "p-4 space-y-3";
    contentDiv.appendChild(mappingsList);

    const labelSpecificMappings = currentMappings[label.id] || [];

    if (labelSpecificMappings.length === 0) {
      const emptyMessage = document.createElement("p");
      emptyMessage.className = "text-gray-500 text-sm italic py-2";
      emptyMessage.textContent = "No sender rules configured for this label.";
      mappingsList.appendChild(emptyMessage);
    } else {
      labelSpecificMappings.forEach((mapping, index) => {
        const mappingItem = document.createElement("div");
        mappingItem.className =
          "flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors duration-150";

        const mappingInfo = document.createElement("div");
        mappingInfo.className = "flex-1";

        const email = document.createElement("div");
        email.className = "font-medium text-gray-900 text-sm";
        email.textContent = mapping.senderEmail;
        mappingInfo.appendChild(email);

        if (mapping.senderName) {
          const name = document.createElement("div");
          name.className = "text-xs text-gray-600 mt-1";
          name.textContent = mapping.senderName;
          mappingInfo.appendChild(name);
        }

        mappingItem.appendChild(mappingInfo);

        const deleteBtn = document.createElement("button");
        deleteBtn.className =
          "ml-3 inline-flex items-center px-3 py-1.5 border border-red-200 text-xs font-medium rounded-md text-red-700 bg-red-50 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors duration-150";
        deleteBtn.innerHTML = `
          <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
          </svg>
          Delete
        `;
        deleteBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          deleteSenderMapping(label.id, index);
        });
        mappingItem.appendChild(deleteBtn);
        mappingsList.appendChild(mappingItem);
      });
    }

    const showAddFormButton = document.createElement("button");
    showAddFormButton.className =
      "w-full mt-4 inline-flex items-center justify-center px-4 py-2 border border-dashed border-gray-300 text-sm font-medium rounded-lg text-gray-600 bg-white hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-150";
    showAddFormButton.innerHTML = `
      <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
      </svg>
      Add Sender Rule
    `;
    mappingsList.appendChild(showAddFormButton);

    const addMappingFormDiv = document.createElement("div");
    addMappingFormDiv.className =
      "mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg hidden";
    mappingsList.appendChild(addMappingFormDiv);

    showAddFormButton.addEventListener("click", (event) => {
      event.stopPropagation();
      addMappingFormDiv.classList.remove("hidden");
      showAddFormButton.classList.add("hidden");
    });

    const formTitle = document.createElement("h4");
    formTitle.className = "text-sm font-semibold text-gray-900 mb-3";
    formTitle.textContent = `Add sender rule for "${labelDisplayName}"`;
    addMappingFormDiv.appendChild(formTitle);

    const inputContainer = document.createElement("div");
    inputContainer.className = "space-y-3";
    addMappingFormDiv.appendChild(inputContainer);

    const senderNameInput = document.createElement("input");
    senderNameInput.type = "text";
    senderNameInput.placeholder = "Sender Name (Optional)";
    senderNameInput.className =
      "block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm";
    inputContainer.appendChild(senderNameInput);

    const senderEmailInput = document.createElement("input");
    senderEmailInput.type = "email";
    senderEmailInput.placeholder = "Sender Email (Required)";
    senderEmailInput.required = true;
    senderEmailInput.className =
      "block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm";
    inputContainer.appendChild(senderEmailInput);

    const buttonContainer = document.createElement("div");
    buttonContainer.className = "flex space-x-3 mt-4";
    addMappingFormDiv.appendChild(buttonContainer);

    const addRuleButton = document.createElement("button");
    addRuleButton.className =
      "inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-150";
    addRuleButton.textContent = "Add Rule";
    buttonContainer.appendChild(addRuleButton);

    const cancelAddButton = document.createElement("button");
    cancelAddButton.className =
      "inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-150";
    cancelAddButton.textContent = "Cancel";
    buttonContainer.appendChild(cancelAddButton);

    addRuleButton.addEventListener("click", () => {
      const senderName = senderNameInput.value.trim();
      const senderEmail = senderEmailInput.value.trim();
      if (!senderEmail) {
        alert("Sender Email is required.");
        return;
      }
      addSenderMapping(label.id, senderName, senderEmail);
      senderNameInput.value = "";
      senderEmailInput.value = "";
      addMappingFormDiv.classList.add("hidden");
      showAddFormButton.classList.remove("hidden");
    });

    cancelAddButton.addEventListener("click", () => {
      senderNameInput.value = "";
      senderEmailInput.value = "";
      addMappingFormDiv.classList.add("hidden");
      showAddFormButton.classList.remove("hidden");
    });

    return { element: labelSectionDiv, hasChildren };
  }

  function renderLabelMappings() {
    labelMappingsContainer.innerHTML = "";

    if (!userLabels || userLabels.length === 0) {
      const emptyState = document.createElement("div");
      emptyState.className = "text-center py-12 text-gray-500";
      emptyState.innerHTML = `
        <div class="mb-4">
          <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 4V2C7 1.448 7.448 1 8 1h8c0.552 0 1 0.448 1 1v2m0 0v16c0 0.552-0.448 1-1 1H8c-0.552 0-1-0.448-1-1V4m0 0H5c-0.552 0-1-0.448-1-1s0.448-1 1-1h2m8 0h2c0.552 0 1 0.448 1 1s-0.448 1-1 1h-2" />
          </svg>
        </div>
        <h3 class="text-lg font-medium text-gray-900 mb-2">No Gmail labels found</h3>
        <p class="text-gray-500">Ensure you have granted permissions and are logged in to Gmail.</p>
      `;
      labelMappingsContainer.appendChild(emptyState);
      return;
    }

    const hierarchy = buildLabelHierarchy(userLabels);
    const sortedRootNames = Object.keys(hierarchy).sort();

    sortedRootNames.forEach((rootName) => {
      const group = hierarchy[rootName];
      const hasChildren = group.children.length > 0;

      if (group.rootLabel) {
        const rootSectionData = createLabelSection(
          group.rootLabel,
          0,
          hasChildren
        );
        const rootSection = rootSectionData.element;
        labelMappingsContainer.appendChild(rootSection);

        if (hasChildren) {
          const childrenContainer = document.createElement("div");
          childrenContainer.className = "";
          childrenContainer.id = `children-${group.rootLabel.id}`;

          const sortedChildren = group.children.sort((a, b) =>
            a.name.localeCompare(b.name)
          );
          sortedChildren.forEach((childLabel) => {
            const childSectionData = createLabelSection(childLabel, 1, false);
            childrenContainer.appendChild(childSectionData.element);
          });

          labelMappingsContainer.appendChild(childrenContainer);

          const rootToggleHeader = rootSection.querySelector(
            ".flex.items-center.justify-between"
          );
          const rootChevron = rootToggleHeader.querySelector("svg");

          let childrenExpanded = true;
          let rootContentExpanded = false;

          rootChevron.style.transform = "rotate(90deg)";

          rootToggleHeader.replaceWith(rootToggleHeader.cloneNode(true));
          const newRootToggleHeader = rootSection.querySelector(
            ".flex.items-center.justify-between"
          );
          const newRootChevron = newRootToggleHeader.querySelector("svg");
          const newLabelInfo = newRootToggleHeader.querySelector(
            ".flex.items-center.space-x-3"
          );
          const newRootContentDiv = rootSection.querySelector(
            ".border-t.border-gray-200.hidden, .hidden"
          );

          newLabelInfo.addEventListener("click", (event) => {
            event.stopPropagation();
            rootContentExpanded = !rootContentExpanded;

            if (rootContentExpanded) {
              newRootContentDiv.classList.remove("hidden");
            } else {
              newRootContentDiv.classList.add("hidden");
            }
          });

          newRootChevron.addEventListener("click", (event) => {
            event.stopPropagation();
            childrenExpanded = !childrenExpanded;

            if (childrenExpanded) {
              childrenContainer.classList.remove("hidden");
              newRootChevron.style.transform = "rotate(90deg)";
            } else {
              childrenContainer.classList.add("hidden");
              newRootChevron.style.transform = "rotate(0deg)";
            }
          });

          newLabelInfo.style.cursor = "pointer";
          newRootChevron.style.cursor = "pointer";
        }
      } else if (hasChildren) {
        const sortedChildren = group.children.sort((a, b) =>
          a.name.localeCompare(b.name)
        );
        sortedChildren.forEach((childLabel) => {
          const childSectionData = createLabelSection(childLabel, 0, false);
          labelMappingsContainer.appendChild(childSectionData.element);
        });
      }
    });
  }

  function addSenderMapping(labelId, senderName, senderEmail) {
    const mappingsForLabel = currentMappings[labelId] || [];
    if (
      mappingsForLabel.some(
        (m) => m.senderEmail.toLowerCase() === senderEmail.toLowerCase()
      )
    ) {
      alert(`Sender email ${senderEmail} is already mapped to this label.`);
      return;
    }
    mappingsForLabel.push({ senderName, senderEmail });
    currentMappings[labelId] = mappingsForLabel;
    saveMappings(currentMappings);
  }

  function deleteSenderMapping(labelId, index) {
    const mappingsForLabel = currentMappings[labelId];
    if (mappingsForLabel && mappingsForLabel[index]) {
      mappingsForLabel.splice(index, 1);
      if (mappingsForLabel.length === 0) {
        delete currentMappings[labelId];
      } else {
        currentMappings[labelId] = mappingsForLabel;
      }
      saveMappings(currentMappings);
    }
  }

  async function initializeOptionsPage() {
    try {
      await loadStoredMappings();
      const token = await getAuthToken(true);
      if (token) {
        await fetchGmailLabels(token);
        renderLabelMappings();
      }
    } catch (error) {
      console.error("Initialization failed:", error);
      const errorDiv = document.createElement("div");
      errorDiv.className = "text-center py-12";

      if (error.message && error.message.includes("consent")) {
        errorDiv.innerHTML = `
          <div class="mb-4">
            <svg class="mx-auto h-12 w-12 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 class="text-lg font-medium text-gray-900 mb-2">Authorization Required</h3>
          <p class="text-gray-500">Please grant the extension access to your Gmail account to manage labels.</p>
        `;
      } else {
        errorDiv.innerHTML = `
          <div class="mb-4">
            <svg class="mx-auto h-12 w-12 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 class="text-lg font-medium text-gray-900 mb-2">Initialization Error</h3>
          <p class="text-gray-500">Could not initialize options page. Check console for errors.</p>
        `;
      }
      labelMappingsContainer.appendChild(errorDiv);
      renderLabelMappings();
    }
  }

  initializeOptionsPage();
});
