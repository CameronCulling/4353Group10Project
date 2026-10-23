const historyRows = document.getElementById("history-rows");
const historyStatus = document.getElementById("history-status");
const historyError = document.getElementById("history-error");
const refreshHistory = document.getElementById("refresh-history");

function addCell(row, text) {
  const cell = document.createElement("td");
  cell.textContent = text;
  row.appendChild(cell);
  return cell;
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : "—";
}

async function loadHistory() {
  refreshHistory.disabled = true;
  historyError.hidden = true;
  historyStatus.textContent = "Loading history…";

  try {
    const data = await QueueSmart.request("/api/history");

    historyRows.replaceChildren();

    data.history.forEach(visit => {
      const row = document.createElement("tr");

      addCell(row, formatDate(visit.joinedAt));
      addCell(row, visit.serviceName);
      addCell(row, formatDate(visit.endedAt));

      addCell(
        row,
        visit.waitMinutes === null
          ? "Still waiting"
          : `${visit.waitMinutes} min`
      );

      const outcomes = {
        waiting: "Waiting",
        left: "Left queue",
        served: "Served"
      };

      const outcomeCell = addCell(
        row,
        outcomes[visit.outcome] || visit.outcome
      );

      if (visit.outcome === "served") {
        outcomeCell.className = "outcome-served";
      } else if (visit.outcome === "left") {
        outcomeCell.className = "outcome-left";
      }

      historyRows.appendChild(row);
    });

    historyStatus.textContent = data.history.length === 0
      ? "No queue history yet. Join a queue to get started."
      : `${data.history.length} queue visit` +
        (data.history.length === 1 ? "" : "s");
  } catch (error) {
    historyStatus.textContent = "History could not be loaded.";
    historyError.textContent = error.message;
    historyError.hidden = false;
  } finally {
    refreshHistory.disabled = false;
  }
}

refreshHistory.addEventListener("click", loadHistory);

loadHistory();