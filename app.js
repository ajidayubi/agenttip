// AgentTip frontend — static, no build step. ethers v6 via CDN (see index.html).
// CONFIG: fill CONTRACT_ADDRESS + DEPLOY_BLOCK after each deployment.
const CONFIG = {
  // BSC MAINNET (56) — contract address filled after mainnet deploy.
  CONTRACT_ADDRESS: "0x0000000000000000000000000000000000000000", // TODO: mainnet address
  CHAIN_ID: 56,
  CHAIN_NAME: "BNB Smart Chain",
  RPC_URL: "https://bsc-dataseed.binance.org/",
  BSCSCAN: "https://bscscan.com",
  DEPLOY_BLOCK: 0, // TODO: deployment block (0 = last 10,000 blocks)
  REGISTRY: "0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F",
};

const $ = (id) => document.getElementById(id);
let provider = null;      // read-only provider (public RPC)
let signer = null;        // connected wallet
let contract = null;      // read-only contract
let contractWithSigner = null;
let abi = null;

async function init() {
  abi = await (await fetch("abi.json")).json();
  provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
  contract = new ethers.Contract(CONFIG.CONTRACT_ADDRESS, abi, provider);
  $("contractLink").href = CONFIG.BSCSCAN + "/address/" + CONFIG.CONTRACT_ADDRESS;
  $("networkInfo").textContent = "Network: " + CONFIG.CHAIN_NAME + " (chain " + CONFIG.CHAIN_ID + ") · Contract: " + CONFIG.CONTRACT_ADDRESS.slice(0, 10) + "…";
  loadRecentTips();
  $("connectBtn").onclick = connectWallet;
  $("resolveBtn").onclick = resolveName;
  $("tipBtn").onclick = sendTip;
  $("nameInput").addEventListener("input", () => { $("tipBtn").disabled = true; hideResolve(); });
  if (window.ethereum) {
    window.ethereum.on("accountsChanged", () => location.reload());
    window.ethereum.on("chainChanged", () => location.reload());
  }
}

function hideResolve() { $("resolveBox").classList.add("hidden"); }
function showResolve(ok, text, addr) {
  const box = $("resolveBox");
  box.classList.remove("hidden");
  box.classList.toggle("bad", !ok);
  $("resolveStatus").textContent = text;
  $("resolveAddr").textContent = addr || "";
}

async function connectWallet() {
  if (!window.ethereum) { $("walletInfo").textContent = "No injected wallet found. Install Binance Wallet or MetaMask, then refresh."; return; }
  try {
    const browserProvider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await browserProvider.send("eth_requestAccounts", []);
    const network = await browserProvider.getNetwork();
    if (Number(network.chainId) !== CONFIG.CHAIN_ID) {
      try {
        await browserProvider.send("wallet_switchEthereumChain", [{ chainId: "0x" + CONFIG.CHAIN_ID.toString(16) }]);
      } catch (e) {
        $("walletInfo").textContent = "Please switch your wallet to " + CONFIG.CHAIN_NAME + " (chain " + CONFIG.CHAIN_ID + ").";
        return;
      }
    }
    signer = await browserProvider.getSigner();
    contractWithSigner = new ethers.Contract(CONFIG.CONTRACT_ADDRESS, abi, signer);
    $("walletInfo").textContent = "Connected: " + accounts[0].slice(0, 8) + "…" + accounts[0].slice(-6);
    $("connectBtn").textContent = "Connected";
    $("connectBtn").disabled = true;
  } catch (e) {
    $("walletInfo").textContent = "Connect failed: " + (e?.shortMessage || e.message);
  }
}

async function resolveName() {
  const name = $("nameInput").value.trim();
  if (!name) { showResolve(false, "Type an Agent ID name first.", ""); return; }
  showResolve(true, "Resolving…", "");
  try {
    const addr = await contract.resolve(name);
    if (addr === ethers.ZeroAddress) {
      showResolve(false, "Not registered — no owner for “" + name + "”. Check the spelling.", "");
      $("tipBtn").disabled = true;
    } else {
      showResolve(true, "Registered ✓ — tips go to:", addr);
      $("tipBtn").disabled = false;
    }
  } catch (e) {
    showResolve(false, "Resolution failed: " + (e?.shortMessage || e.message), "");
  }
}

async function sendTip() {
  if (!signer) { $("txStatus").textContent = "Connect your wallet first."; return; }
  const name = $("nameInput").value.trim();
  const amountStr = $("amountInput").value;
  const message = $("messageInput").value;
  let amount;
  try { amount = ethers.parseEther(amountStr); } catch { $("txStatus").textContent = "Invalid amount."; return; }
  const minTip = await contract.MIN_TIP();
  if (amount < minTip) { $("txStatus").textContent = "Minimum tip is " + ethers.formatEther(minTip) + " BNB."; return; }
  $("txStatus").textContent = "Sending… confirm in your wallet.";
  $("tipBtn").disabled = true;
  try {
    const tx = await contractWithSigner.tip(name, message, { value: amount });
    $("txStatus").innerHTML = "Sent — waiting for confirmation… <a href=\"" + CONFIG.BSCSCAN + "/tx/" + tx.hash + "\" target=\"_blank\" rel=\"noopener\">" + tx.hash.slice(0, 12) + "…</a>";
    await tx.wait();
    $("txStatus").innerHTML = "Tipped ✓ <a href=\"" + CONFIG.BSCSCAN + "/tx/" + tx.hash + "\" target=\"_blank\" rel=\"noopener\">view on BscScan</a>";
    loadRecentTips();
  } catch (e) {
    $("txStatus").textContent = "Failed: " + (e?.shortMessage || e?.reason || e.message);
  } finally {
    $("tipBtn").disabled = false;
  }
}

async function loadRecentTips() {
  const list = $("tipsList");
  try {
    const latest = await provider.getBlockNumber();
    const fromBlock = CONFIG.DEPLOY_BLOCK > 0 ? CONFIG.DEPLOY_BLOCK : Math.max(0, latest - 10000);
    const events = await contract.queryFilter(contract.filters.Tip, fromBlock, latest);
    const recent = events.slice(-10).reverse();
    if (!recent.length) { list.innerHTML = "<li class=\"muted\">No tips yet — be the first.</li>"; return; }
    list.innerHTML = recent.map((ev) => {
      const a = ev.args;
      const msg = a.message ? " — “" + escapeHtml(a.message) + "”" : "";
      return "<li><span class=\"amt\">" + ethers.formatEther(a.amount) + " BNB</span> to <code>" + escapeHtml(a.name) + "</code> from <code>" + a.sender.slice(0, 8) + "…</code>" + msg +
        " · <a href=\"" + CONFIG.BSCSCAN + "/tx/" + ev.transactionHash + "\" target=\"_blank\" rel=\"noopener\">tx</a></li>";
    }).join("");
  } catch (e) {
    list.innerHTML = "<li class=\"muted\">Could not load tips (" + escapeHtml(e?.shortMessage || e.message) + ").</li>";
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

document.addEventListener("DOMContentLoaded", init);
