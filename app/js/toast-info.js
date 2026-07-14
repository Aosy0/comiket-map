const toastInfo = [
  {status: "success", icon: "icon-check", color: "var(--priority-low)"},
  {status: "processing", icon: "icon-renew", color: "var(--priority-medium)"},
  {status: "error", icon: "icon-alert", color: "var(--priority-high)"}
]

const getToastStatus = (index) => {
  return toastInfo[index]["status"];
}

const getToastIcon = (index) => {
  return toastInfo[index]["icon"];
}

const getToastColor = (index) => {
  return toastInfo[index]["color"];
}


