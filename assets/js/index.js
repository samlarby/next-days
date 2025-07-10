let replenData = {};

const dropArea = document.getElementById('drop-area');
const fileInput = document.getElementById('csvFile');
const fileNameDisplay = document.getElementById('file-name');

fileInput.addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (file) {
    fileNameDisplay.textContent = `Selected file: ${file.name}`;
    handleFile(file);
  }
});

['dragenter', 'dragover'].forEach(eventName => {
  dropArea.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropArea.classList.add('dragover');
  });
});

['dragleave', 'drop'].forEach(eventName => {
  dropArea.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropArea.classList.remove('dragover');
  });
});

dropArea.addEventListener('drop', (e) => {
  const file = e.dataTransfer.files[0];
  if (file) {
    fileNameDisplay.textContent = `Selected file: ${file.name}`;
    handleFile(file);
  }
});

function handleFile(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    const content = e.target.result;
    replenData = parseCSV(content);
  };
  reader.readAsText(file, 'UTF-8');
}

function parseCSV(content) {
  const delimiter = ',';  // <-- CSV is comma-separated
  const lines = content.trim().split('\n');

  function clean(cell) {
    if (typeof cell !== "string") return "";
    return cell.replace(/^"|"$/g, "").trim();
  }

  const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"+|"+$/g, ''));

  const data = {};

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;

    const row = lines[i].split(delimiter).map(clean);
    const rowData = {};
    headers.forEach((h, j) => {
      rowData[h] = row[j] || "";
    });

    const sku = rowData["Item Code"];
    const location = rowData["From Location"];
    const qty = parseInt(rowData["From Quantity"] || "0", 10);

    if (sku && location && !isNaN(qty)) {
      if (!data[sku]) data[sku] = { total: 0, locations: {} };
      data[sku].total += qty;
      data[sku].locations[location] = (data[sku].locations[location] || 0) + qty;
    }
  }

  return data;
}

function parseLocation(loc) {
  const match = loc.match(/^([A-Z]+\d+)\.C(\d+)\.S(\d+)$/);
  if (!match) return { parsed: false, aisle: '', col: 0, shelf: 0 };
  return {
    parsed: true,
    aisle: match[1],
    col: parseInt(match[2], 10),
    shelf: parseInt(match[3], 10)
  };
}

function pickLocationSorter([locA], [locB]) {
  const parsedA = parseLocation(locA);
  const parsedB = parseLocation(locB);

  const isAParsed = parsedA.parsed;
  const isBParsed = parsedB.parsed;

  if (isAParsed && isBParsed) {
    // Both are bin-style, compare aisle/col/shelf
    if (parsedA.aisle !== parsedB.aisle) return parsedA.aisle.localeCompare(parsedB.aisle);
    if (parsedA.col !== parsedB.col) return parsedA.col - parsedB.col;
    return parsedA.shelf - parsedB.shelf;
  }

  if (isAParsed && !isBParsed) {
    // Parsed bin locations always come first
    return -1;
  }

  if (!isAParsed && isBParsed) {
    return 1;
  }

  // Neither parsed: compare alphabetically
  return locA.localeCompare(locB);
}

document.getElementById("csvFile").addEventListener("change", function(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = function(e) {
    const content = e.target.result;
    replenData = parseCSV(content);}
  reader.readAsText(file, "UTF-8");
});

  function extractErrorLogSKUs(text) {
    const lines = text.split('\n');
    const skuCounts = {};

    for (const line of lines) {
      const match = line.match(/for\s+(\w+)\s+\(x(\d+)\)/i);
      if (match) {
        const sku = match[1];
        const qty = parseInt(match[2], 10);
        skuCounts[sku] = (skuCounts[sku] || 0) + qty;
      }
    }

    return skuCounts;
  }

  function processData() {
  const logText = document.getElementById("errorLog").value;
  const demandData = extractErrorLogSKUs(logText);

  // Step 1: Create all pick tasks with quantities
  const pickTasks = [];

  for (const sku of Object.keys(demandData)) {
    const required = demandData[sku];
    const availableData = replenData[sku] || { total: 0, locations: {} };
    let toPick = required;

    if (availableData.total > 0) {
      const sortedLocations = Object.entries(availableData.locations).sort(pickLocationSorter);

      const picks = [];
      for (const [location, qty] of sortedLocations) {
        if (toPick <= 0) break;
        const pickQty = Math.min(qty, toPick);
        picks.push({ location, qty: pickQty });
        toPick -= pickQty;
      }

      if (toPick > 0) {
        picks.push({ location: `❌ Shortfall: ${toPick}`, qty: 0 });
      }

      // Add all of these individual tasks to the big list (so we can sort globally)
      for (const p of picks) {
        pickTasks.push({
          sku,
          required,
          location: p.location,
          qty: p.qty,
          multi: picks.length > 1
        });
      }
    } else {
      // No stock at all
      pickTasks.push({
        sku,
        required,
        location: '—',
        qty: 0,
        multi: false
      });
    }
  }

  // Step 2: Globally sort the pick tasks by location
  pickTasks.sort((a, b) => pickLocationSorter([a.location], [b.location]));

  // Step 3: Group back into rows for your table
  const rows = {};
  for (const task of pickTasks) {
    if (!rows[task.sku]) {
      rows[task.sku] = {
        sku: task.sku,
        required: task.required,
        picks: []
      };
    }

    // Display with qty only if multi-location is needed
    if (task.multi && task.qty > 0) {
      rows[task.sku].picks.push(`${task.location} (${task.qty})`);
    } else {
      rows[task.sku].picks.push(`${task.location}`);
    }
  }

  // Step 4: Render your table
  let html = "<h3>Next Days</h3><table><tr><th>SKU</th><th>Quantity</th><th>From Location</th></tr>";
  for (const row of Object.values(rows)) {
    const availableData = replenData[row.sku] || { total: 0 };
    const enough = availableData.total >= row.required;

    html += `<tr class="${enough ? 'enough' : 'notenough'}">
      <td>${row.sku}</td>
      <td>${row.required}</td>
      <td>${row.picks.join('<br>')}</td>
    </tr>`;
  }
  html += "</table>";
  document.getElementById("results").innerHTML = html;
}