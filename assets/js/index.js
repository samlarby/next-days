let replenData = {};

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

    const rows = Object.keys(demandData).map(sku => {
      const required = demandData[sku];
      const availableData = replenData[sku] || { total: 0, locations: {} };
      const available = availableData.total;
      const diff = available - required;
      const enough = available >= required;

      let pickPlan = "";

  if (available > 0) {
    const sortedLocations = Object.entries(availableData.locations)
      .sort((a, b) => b[1] - a[1]); // Descending by quantity

    let toPick = required;
    const picks = [];

    for (const [location, qty] of sortedLocations) {
      if (toPick <= 0) break;
      const pickQty = Math.min(qty, toPick);
      picks.push(`${location}`);
      toPick -= pickQty;
    }

    if (toPick > 0) {
      picks.push(`❌ Shortfall: ${toPick}`);
    }

    pickPlan = picks.join("<br>");
  } else {
    pickPlan = "—";
  }

  return { sku, required, available, diff, enough, pickPlan };
});

// Display table
let html = "<h3>Next Days</h3><table><tr><th>SKU</th><th>Quantity</th><th>From Location</th></tr>";

for (const row of rows) {
  html += `<tr class="${row.enough ? 'enough' : 'notenough'}">
    <td>${row.sku}</td>
    <td>${row.required}</td>
    <td>${row.pickPlan}</td>
  </tr>`;
}

html += "</table>";
document.getElementById("results").innerHTML = html;
}

  