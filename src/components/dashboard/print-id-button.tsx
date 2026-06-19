"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

export function PrintIdButton() {
  return (
    <Button className="print:hidden" variant="secondary" onClick={() => window.print()}>
      <Printer className="h-4 w-4" />Print ID
    </Button>
  );
}
