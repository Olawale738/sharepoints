import { FileScanStatus } from "@prisma/client";

const blockedExtensions = new Set(["exe", "dll", "bat", "cmd", "com", "msi", "scr", "ps1", "js", "vbs", "jar"]);
const eicarMarker = "EICAR-STANDARD-ANTIVIRUS-TEST-FILE";

export function scanUploadedFile(fileName: string, body: Buffer) {
  const extension = fileName.toLowerCase().split(".").pop() ?? "";

  if (blockedExtensions.has(extension)) {
    return {
      status: FileScanStatus.INFECTED,
      details: `Blocked executable file type: .${extension}`
    };
  }

  if (body.toString("utf8", 0, Math.min(body.length, 4096)).includes(eicarMarker)) {
    return {
      status: FileScanStatus.INFECTED,
      details: "Known antivirus test signature detected."
    };
  }

  return {
    status: FileScanStatus.CLEAN,
    details: "Passed LETW built-in signature and file-type screening."
  };
}
