// --- Interactive Entity Editor ---

let editingEntityOriginalName = null;

// This is called by Mermaid's click event
window.handleClassClick = function (className) {
  if (!currentSpec) return;
  openEntityModal(className);
};

window.openEntityModal = function (className = null) {
  const modal = document.getElementById("entityEditModal");
  const title = document.getElementById("entityModalTitle");
  const nameInput = document.getElementById("entityNameInput");
  const tbody = document.getElementById("entityFieldsTable");
  const deleteBtn = document.getElementById("btnDeleteEntity");

  tbody.innerHTML = "";
  editingEntityOriginalName = className;

  if (className) {
    title.textContent = `Edit Entity: ${className}`;
    nameInput.value = className;
    deleteBtn.classList.remove("hidden");

    // Find existing entity across domains
    let entity = null;
    if (currentSpec.domains) {
      for (const d of currentSpec.domains) {
        const found = d.entities?.find((e) => e.name === className);
        if (found) {
          entity = found;
          break;
        }
      }
    }

    if (entity && entity.fields) {
      entity.fields.forEach((f) => window.addEntityField(f));
    }
  } else {
    title.textContent = "New Entity";
    nameInput.value = "";
    deleteBtn.classList.add("hidden");
    // Default field
    window.addEntityField({ name: "id", type: "uuid", primary: true });
  }

  if (window.ModalManager) {
    window.ModalManager.open("entityEditModal");
  } else {
    modal.classList.remove("hidden");
  }
};

window.closeEntityModal = function () {
  if (window.ModalManager) {
    window.ModalManager.close("entityEditModal");
  } else {
    document.getElementById("entityEditModal").classList.add("hidden");
  }
};

window.addEntityField = function (
  field = { name: "", type: "string", primary: false },
) {
  const tbody = document.getElementById("entityFieldsTable");
  const tr = document.createElement("tr");
  tr.className =
    "field-row focus-within:bg-slate-800/50 transition-colors group";

  // Build type options based on existing entities for FKs
  let entityNames = [];
  if (currentSpec && currentSpec.domains) {
    currentSpec.domains.forEach((d) => {
      if (d.entities) d.entities.forEach((e) => entityNames.push(e.name));
    });
  }

  const standardTypes = ["string", "uuid", "int", "boolean"];
  let typeOptionsHtml = standardTypes
    .map(
      (t) =>
        `<option value="${t}" ${field.type === t ? "selected" : ""}>${t}</option>`,
    )
    .join("");

  if (entityNames.length > 0) {
    typeOptionsHtml += `<optgroup label="Foreign Keys">`;
    typeOptionsHtml += entityNames
      .map(
        (en) =>
          `<option value="${en}" ${field.type === en || field.type === en + "Id" ? "selected" : ""}>-> ${en}</option>`,
      )
      .join("");
    typeOptionsHtml += `</optgroup>`;
  }
  // Handle case where field type is custom but not in list
  if (
    field.type &&
    !standardTypes.includes(field.type) &&
    !entityNames.includes(field.type) &&
    !field.type.endsWith("Id")
  ) {
    typeOptionsHtml += `<option value="${field.type}" selected>${field.type}</option>`;
  }

  tr.innerHTML = `
        <td class="p-2">
            <input type="text" class="field-name w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-sm focus:border-archon-500 outline-none" placeholder="name" value="${field.name || ""}">
        </td>
        <td class="p-2">
            <select class="field-type w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-sm outline-none">
                ${typeOptionsHtml}
            </select>
        </td>
        <td class="p-2 text-center">
            <input type="checkbox" class="field-pk accent-archon-500 w-4 h-4 rounded border-slate-700" ${field.primary ? "checked" : ""}>
        </td>
        <td class="p-2 text-center">
            <button onclick="this.closest('tr').remove()" class="text-slate-500 hover:text-red-400 p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </button>
        </td>
    `;
  tbody.appendChild(tr);

  // --- Foreign Key Naming Logic ---
  const typeSelect = tr.querySelector(".field-type");
  const nameInput = tr.querySelector(".field-name");

  const checkFKState = () => {
    const val = typeSelect.value;
    const isFK = entityNames.includes(val);

    if (isFK) {
      // Auto-generate consistent name: camelCase + 'Id' (e.g. User -> userId)
      const autoName = val.charAt(0).toLowerCase() + val.slice(1) + "Id";
      nameInput.value = autoName;

      // Lock input to enforce consistency
      nameInput.readOnly = true;
      nameInput.classList.add(
        "opacity-50",
        "bg-slate-800",
        "cursor-not-allowed",
      );
      nameInput.classList.remove("focus:border-archon-500", "bg-slate-900");
    } else {
      // Unlock for standard types
      nameInput.readOnly = false;
      nameInput.classList.remove(
        "opacity-50",
        "bg-slate-800",
        "cursor-not-allowed",
      );
      nameInput.classList.add("focus:border-archon-500", "bg-slate-900");
    }
  };

  // Run on initial render
  checkFKState();

  // Run on change
  typeSelect.addEventListener("change", checkFKState);
};

window.saveEntityEdit = function () {
  const newName = document.getElementById("entityNameInput").value.trim();
  if (!newName) return alert("Class name is required.");

  // Extract fields
  const fields = [];
  document.querySelectorAll("#entityFieldsTable .field-row").forEach((row) => {
    const name = row.querySelector(".field-name").value.trim();
    const type = row.querySelector(".field-type").value;
    const primary = row.querySelector(".field-pk").checked;
    if (name) fields.push({ name, type, primary });
  });

  if (!currentSpec.domains || currentSpec.domains.length === 0) {
    currentSpec.domains = [{ name: "Default", entities: [], services: [] }];
  }

  let targetDomain = currentSpec.domains[0];
  let existingEntity = null;

  // Remove old or find existing
  for (const d of currentSpec.domains) {
    if (!d.entities) d.entities = [];
    const idx = d.entities.findIndex(
      (e) => e.name === editingEntityOriginalName,
    );
    if (idx !== -1) {
      existingEntity = d.entities[idx];
      targetDomain = d;
      if (newName !== editingEntityOriginalName) {
        d.entities.splice(idx, 1); // Remove old name version
        existingEntity = null; // force recreation below
      }
      break;
    }
  }

  if (existingEntity) {
    existingEntity.fields = fields;
  } else {
    targetDomain.entities.push({ name: newName, fields });
  }

  closeEntityModal();
  // Reload diagram from updated visual state
  loadDiagram("model");
};

window.deleteEntity = function () {
  if (
    !editingEntityOriginalName ||
    !confirm(`Delete class ${editingEntityOriginalName}?`)
  )
    return;

  for (const d of currentSpec.domains) {
    if (!d.entities) continue;
    const idx = d.entities.findIndex(
      (e) => e.name === editingEntityOriginalName,
    );
    if (idx !== -1) {
      d.entities.splice(idx, 1);
      break;
    }
  }
  closeEntityModal();
  loadDiagram("model");
};
