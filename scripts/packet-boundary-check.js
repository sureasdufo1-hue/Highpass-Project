import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const prefix = process.env.HIPASS_VALIDATION_PREFIX;
if (!prefix?.startsWith("hp-validation-")) throw new Error("Explicit synthetic validation prefix required");
const source = `${prefix}-viewer`;
const helper = process.env.HIPASS_PACKET_PROBE_IMAGE ?? "hipass-network-probe:local";
const owned = [];
const results = [];
let helperDigest = null;
const command = (args, timeout = 15000) => execFileSync("docker", args, { encoding: "utf8", timeout, windowsHide: true, maxBuffer: 1024 * 1024 });
const inspect = (name) => JSON.parse(command(["inspect", name]))[0];
const captureLogs = (name) => {
  const result = spawnSync("docker", ["logs", name], { encoding: "utf8", stdio: "pipe", timeout: 15000, windowsHide: true });
  if (result.error || result.status !== 0) throw new Error("Capture log collection failed");
  return `${result.stdout}\n${result.stderr}`;
};
const ipv4 = (container, suffix) => Object.entries(container.NetworkSettings.Networks).find(([name]) => name.endsWith(suffix))?.[1].IPAddress;
const nodeProbe = (container, host, port) => {
  const code = `const net=require('node:net');const s=net.connect({host:${JSON.stringify(host)},port:${port}});let done=false;const end=(result)=>{if(done)return;done=true;console.log(JSON.stringify(result));s.destroy();};s.on('connect',()=>end({result:'CONNECTED'}));s.on('error',e=>end({result:e.code}));setTimeout(()=>end({result:'ETIMEDOUT'}),3000).unref();`;
  return JSON.parse(command(["exec", container, "/nodejs/bin/node", "-e", code]));
};
try {
  helperDigest = inspect(helper).Id;
  const from = inspect(source);
  if (!from.State.Running || from.Config.Labels["com.docker.compose.project"] !== prefix) throw new Error("Source scope mismatch");
  const sourceIp = ipv4(from, "_frontend_net");
  for (const target of [{ name: `${prefix}-db`, suffix: "_db_net", port: 5432, control: `${prefix}-api` }, { name: `${prefix}-pacs`, suffix: "_dicom_private_net", port: 8042, control: `${prefix}-mtls` }]) {
    const to = inspect(target.name);
    const targetIp = ipv4(to, target.suffix);
    if (!to.State.Running || to.Config.Labels["com.docker.compose.project"] !== prefix || !sourceIp || !targetIp) throw new Error("Target scope mismatch");
    const captures = [];
    for (const [side, namespace] of [["source", source], ["destination", target.name]]) {
      const name = `hp-packet-${randomUUID()}`;
      owned.push(name);
      command(["run", "-d", "--name", name, "--network", `container:${namespace}`, "--cap-drop=ALL", "--cap-add=NET_RAW", "--security-opt=no-new-privileges", "--entrypoint", "timeout", helper, "60", "tcpdump", "-p", "-l", "-nn", "-i", "any", `tcp and dst host ${targetIp} and dst port ${target.port} and tcp[tcpflags] & tcp-syn != 0`], 30000);
      const start = Date.now();
      let ready = false;
      while (Date.now() - start < 15000) {
        // tcpdump writes readiness to stderr, inspect the exact helper only.
        try { command(["exec", name, "sh", "-c", "test -d /proc/1 && pidof tcpdump >/dev/null"]); ready = true; break; } catch {}
      }
      if (!ready) throw new Error("Capture not ready");
      captures.push({ side, name });
    }
    const positive = nodeProbe(target.control, targetIp, target.port);
    const negative = nodeProbe(source, targetIp, target.port);
    for (const capture of captures) command(["stop", "-t", "1", capture.name]);
    const sourcePackets = captureLogs(captures[0].name);
    const destinationPackets = captureLogs(captures[1].name);
    const marker = `${sourceIp}.`;
    const sourceSyn = sourcePackets.split(/\r?\n/).filter(line => line.includes(marker) && line.includes("Flags [S]"));
    const destinationSyn = destinationPackets.split(/\r?\n/).filter(line => line.includes(marker) && line.includes("Flags [S]"));
    const controlSyn = destinationPackets.split(/\r?\n/).filter(line => !line.includes(marker) && line.includes("Flags [S]"));
    const topology = !Object.keys(from.NetworkSettings.Networks).some(network => network in to.NetworkSettings.Networks);
    const captureLossFree = [sourcePackets, destinationPackets].every(log => /(?:^|\n)0 packets dropped by kernel(?:\r?\n|$)/.test(log));
    const verified = positive.result === "CONNECTED" && controlSyn.length > 0 && sourceSyn.length > 0 && destinationSyn.length === 0 && topology && captureLossFree && negative.result === "ETIMEDOUT";
    results.push({ target: target.name, port: target.port, positiveControl: positive.result, negativeTransport: negative.result, sourceSynCount: sourceSyn.length, destinationSynCount: destinationSyn.length, controlSynCount: controlSyn.length, captureLossFree, sourcePackets, destinationPackets, evidenceType: "DUAL_NAMESPACE_PACKET_CAPTURE", result: verified ? "PASS" : "NOT VERIFIED", limitation: "Observed SYN nondelivery with healthy listener and positive control; not an assertion of a specific iptables rule" });
  }
} catch (error) { results.push({ result: "NOT VERIFIED", reason: error.code ?? "PACKET_PROBE_FAILED" }); }
finally {
  for (const name of owned) { try { command(["rm", "-f", name]); } catch { results.push({ result: "NOT VERIFIED", reason: "HELPER_CLEANUP_FAILED", name }); } }
}
console.log(JSON.stringify({ generatedAt: new Date().toISOString(), scope: prefix, helperDigest, reviewStatus: "DRAFT", reviewer: "UNASSIGNED", results }, null, 2));
process.exit(results.length === 2 && results.every(item => item.result === "PASS") ? 0 : 2);
