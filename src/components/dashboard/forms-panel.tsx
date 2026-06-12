"use client";

import {
  BarChart3,
  Download,
  FileQuestion,
  GripVertical,
  Loader2,
  Plus,
  Send,
  ShieldCheck,
  Signature,
  WalletCards,
  X
} from "lucide-react";
import { DragEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type FormCondition = {
  fieldId: string;
  operator: "EQUALS" | "NOT_EQUALS" | "CONTAINS" | "CHECKED";
  value?: string | boolean;
};

type FormField = {
  id: string;
  label: string;
  type: "TEXT" | "LONG_TEXT" | "EMAIL" | "NUMBER" | "DATE" | "CHOICE" | "CHECKBOX";
  required?: boolean;
  options?: string[];
  placeholder?: string;
  condition?: FormCondition;
};

type WorkspaceForm = {
  id: string;
  title: string;
  description?: string | null;
  status: "DRAFT" | "OPEN" | "CLOSED";
  fields: FormField[];
  requiresApproval: boolean;
  signatureRequired: boolean;
  paymentRequired: boolean;
  paymentAmount?: number | null;
  paymentCurrency: string;
  paymentUrl?: string | null;
  responses?: Array<{
    id: string;
    createdAt: string;
    approvalStatus: string;
    paymentStatus: string;
  }>;
  _count?: { responses: number };
};

function isVisible(field: FormField, answers: Record<string, string | boolean>) {
  if (!field.condition) return true;
  const actual = answers[field.condition.fieldId];
  if (field.condition.operator === "CHECKED") return actual === true;
  const actualText = String(actual ?? "");
  const expectedText = String(field.condition.value ?? "");
  if (field.condition.operator === "EQUALS") return actualText === expectedText;
  if (field.condition.operator === "NOT_EQUALS") return actualText !== expectedText;
  return actualText.toLowerCase().includes(expectedText.toLowerCase());
}

function money(amount?: number | null, currency = "GBP") {
  if (amount === null || amount === undefined) return "";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount / 100);
}

export function FormsPanel({ workspaceId, canManage }: { workspaceId: string; canManage: boolean }) {
  const [forms, setForms] = useState<WorkspaceForm[]>([]);
  const [activeForm, setActiveForm] = useState<WorkspaceForm | null>(null);
  const [building, setBuilding] = useState(false);
  const [fields, setFields] = useState<FormField[]>([]);
  const [answers, setAnswers] = useState<Record<string, string | boolean>>({});
  const [draggedFieldId, setDraggedFieldId] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  const loadForms = useCallback(async () => {
    const response = await fetch(`/api/workspaces/${workspaceId}/forms`);
    setLoading(false);
    if (!response.ok) return;
    const data = (await response.json()) as { forms: WorkspaceForm[] };
    setForms(data.forms);
    setActiveForm((current) => data.forms.find((item) => item.id === current?.id) ?? data.forms[0] ?? null);
  }, [workspaceId]);

  useEffect(() => {
    void loadForms();
  }, [loadForms]);

  const visibleFields = useMemo(
    () => activeForm?.fields.filter((field) => isVisible(field, answers)) ?? [],
    [activeForm, answers]
  );

  function addField() {
    setFields((current) => [
      ...current,
      { id: crypto.randomUUID(), label: "", type: "TEXT", required: false, placeholder: "" }
    ]);
  }

  function updateField(id: string, patch: Partial<FormField>) {
    setFields((current) => current.map((field) => (field.id === id ? { ...field, ...patch } : field)));
  }

  function dropField(event: DragEvent<HTMLDivElement>, targetId: string) {
    event.preventDefault();
    if (!draggedFieldId || draggedFieldId === targetId) return;
    setFields((current) => {
      const sourceIndex = current.findIndex((field) => field.id === draggedFieldId);
      const targetIndex = current.findIndex((field) => field.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const next = [...current];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
    setDraggedFieldId("");
  }

  async function createForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = event.currentTarget;
    const formData = new FormData(form);
    const paymentAmount = String(formData.get("paymentAmount") ?? "");
    const response = await fetch(`/api/workspaces/${workspaceId}/forms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: String(formData.get("title")),
        description: String(formData.get("description") ?? ""),
        status: String(formData.get("status")),
        fields,
        requiresApproval: formData.get("requiresApproval") === "on",
        signatureRequired: formData.get("signatureRequired") === "on",
        paymentRequired: formData.get("paymentRequired") === "on",
        paymentAmount: paymentAmount ? Math.round(Number(paymentAmount) * 100) : null,
        paymentCurrency: String(formData.get("paymentCurrency") || "GBP"),
        paymentUrl: String(formData.get("paymentUrl") || "")
      })
    });
    const data = (await response.json().catch(() => null)) as { form?: WorkspaceForm; error?: string } | null;

    if (!response.ok || !data?.form) {
      setError(data?.error ?? "Form could not be created.");
      return;
    }

    setForms((current) => [data.form as WorkspaceForm, ...current]);
    setActiveForm(data.form);
    setBuilding(false);
    setFields([]);
    setAnswers({});
    form.reset();
  }

  async function submitResponse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeForm) return;
    setError("");
    setStatus("");
    const formData = new FormData(event.currentTarget);
    const response = await fetch(`/api/forms/${activeForm.id}/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        answers,
        signatureName: String(formData.get("signatureName") || "") || null,
        paymentReference: String(formData.get("paymentReference") || "") || null
      })
    });
    const data = (await response.json().catch(() => null)) as {
      response?: { approvalStatus: string; paymentStatus: string };
      error?: string;
    } | null;

    if (!response.ok) {
      setError(data?.error ?? "Response could not be submitted.");
      return;
    }

    const approvalMessage = activeForm.requiresApproval ? " It is waiting for approval." : "";
    setStatus(`Your response has been saved.${approvalMessage}`);
    setAnswers({});
    event.currentTarget.reset();
    await loadForms();
  }

  return (
    <section id="forms" className="scroll-mt-24 overflow-hidden rounded-lg border border-ink/10 bg-white">
      <div className="flex items-center justify-between border-b border-ink/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <FileQuestion className="h-4 w-4 text-moss" />
          <h2 className="text-sm font-semibold">Smart forms and surveys</h2>
        </div>
        {canManage ? (
          <Button
            className="h-9"
            variant="secondary"
            onClick={() => {
              setBuilding(true);
              setActiveForm(null);
              setFields([{ id: crypto.randomUUID(), label: "", type: "TEXT", required: false }]);
            }}
          >
            <Plus className="h-4 w-4" />
            New form
          </Button>
        ) : null}
      </div>
      <div className="grid min-h-[30rem] md:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="border-b border-ink/10 bg-paper p-3 md:border-b-0 md:border-r">
          {loading ? <Loader2 className="h-4 w-4 animate-spin text-moss" /> : null}
          {!loading && !forms.length ? <p className="text-sm text-ink/55">No forms yet.</p> : null}
          <div className="space-y-1">
            {forms.map((form) => (
              <button
                key={form.id}
                className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                  activeForm?.id === form.id ? "bg-moss text-white" : "hover:bg-mint"
                }`}
                type="button"
                onClick={() => {
                  setBuilding(false);
                  setActiveForm(form);
                  setAnswers({});
                  setError("");
                  setStatus("");
                }}
              >
                <span className="block truncate font-medium">{form.title}</span>
                <span className="flex items-center justify-between text-xs opacity-70">
                  <span>{form.status.toLowerCase()}</span>
                  <span>{form._count?.responses ?? 0}</span>
                </span>
              </button>
            ))}
          </div>
        </aside>
        <div className="p-4">
          {building ? (
            <form className="space-y-4" onSubmit={createForm}>
              <div className="grid gap-3 md:grid-cols-2">
                <Input name="title" placeholder="Form or survey title" required />
                <select className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm" name="status">
                  <option value="DRAFT">Draft</option>
                  <option value="OPEN">Open for responses</option>
                  <option value="CLOSED">Closed</option>
                </select>
                <Textarea className="md:col-span-2" name="description" placeholder="Purpose and instructions" />
              </div>

              <div className="grid gap-2 rounded-md bg-paper p-3 text-sm sm:grid-cols-3">
                <label className="flex items-center gap-2">
                  <input name="requiresApproval" type="checkbox" />
                  <ShieldCheck className="h-4 w-4 text-moss" />
                  Approval required
                </label>
                <label className="flex items-center gap-2">
                  <input name="signatureRequired" type="checkbox" />
                  <Signature className="h-4 w-4 text-moss" />
                  Typed signature
                </label>
                <label className="flex items-center gap-2">
                  <input name="paymentRequired" type="checkbox" />
                  <WalletCards className="h-4 w-4 text-moss" />
                  Payment reference
                </label>
                <Input name="paymentAmount" min="0" step="0.01" type="number" placeholder="Amount" />
                <select className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm" name="paymentCurrency">
                  <option>GBP</option>
                  <option>NGN</option>
                  <option>USD</option>
                  <option>EUR</option>
                </select>
                <Input name="paymentUrl" type="url" placeholder="Hosted payment URL" />
              </div>

              <div className="space-y-2">
                {fields.map((field, index) => (
                  <div
                    key={field.id}
                    className="grid gap-2 rounded-md border border-ink/10 bg-white p-3 md:grid-cols-[auto_minmax(0,1fr)_10rem_auto]"
                    draggable
                    onDragStart={() => setDraggedFieldId(field.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => dropField(event, field.id)}
                  >
                    <button
                      aria-label="Drag to reorder question"
                      className="inline-flex h-10 w-8 cursor-grab items-center justify-center text-ink/35"
                      type="button"
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>
                    <Input
                      placeholder={`Question ${index + 1}`}
                      value={field.label}
                      onChange={(event) => updateField(field.id, { label: event.target.value })}
                      required
                    />
                    <select
                      className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm"
                      value={field.type}
                      onChange={(event) => updateField(field.id, { type: event.target.value as FormField["type"] })}
                    >
                      <option value="TEXT">Short text</option>
                      <option value="LONG_TEXT">Long text</option>
                      <option value="EMAIL">Email</option>
                      <option value="NUMBER">Number</option>
                      <option value="DATE">Date</option>
                      <option value="CHOICE">Choice</option>
                      <option value="CHECKBOX">Checkbox</option>
                    </select>
                    <button
                      aria-label="Remove question"
                      className="inline-flex h-10 w-10 items-center justify-center rounded-md text-clay hover:bg-clay/10"
                      type="button"
                      onClick={() => setFields((current) => current.filter((item) => item.id !== field.id))}
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <Input
                      className="md:col-start-2"
                      placeholder="Answer placeholder"
                      value={field.placeholder ?? ""}
                      onChange={(event) => updateField(field.id, { placeholder: event.target.value })}
                    />
                    {field.type === "CHOICE" ? (
                      <Input
                        className="md:col-span-2"
                        placeholder="Options separated by commas"
                        value={(field.options ?? []).join(", ")}
                        onChange={(event) =>
                          updateField(field.id, {
                            options: event.target.value.split(",").map((value) => value.trim()).filter(Boolean)
                          })
                        }
                      />
                    ) : <div className="md:col-span-2" />}
                    <label className="flex items-center gap-2 text-xs text-ink/60 md:col-start-2">
                      <input
                        type="checkbox"
                        checked={Boolean(field.required)}
                        onChange={(event) => updateField(field.id, { required: event.target.checked })}
                      />
                      Required response
                    </label>
                    {index > 0 ? (
                      <div className="grid gap-2 md:col-span-2 md:grid-cols-3">
                        <select
                          aria-label="Conditional source question"
                          className="h-9 rounded-md border border-ink/10 bg-white px-2 text-xs"
                          value={field.condition?.fieldId ?? ""}
                          onChange={(event) =>
                            updateField(field.id, {
                              condition: event.target.value
                                ? { fieldId: event.target.value, operator: "EQUALS", value: "" }
                                : undefined
                            })
                          }
                        >
                          <option value="">Always show</option>
                          {fields.slice(0, index).map((item) => (
                            <option key={item.id} value={item.id}>When: {item.label || "Untitled question"}</option>
                          ))}
                        </select>
                        {field.condition ? (
                          <>
                            <select
                              aria-label="Conditional operator"
                              className="h-9 rounded-md border border-ink/10 bg-white px-2 text-xs"
                              value={field.condition.operator}
                              onChange={(event) =>
                                updateField(field.id, {
                                  condition: { ...field.condition!, operator: event.target.value as FormCondition["operator"] }
                                })
                              }
                            >
                              <option value="EQUALS">Equals</option>
                              <option value="NOT_EQUALS">Does not equal</option>
                              <option value="CONTAINS">Contains</option>
                              <option value="CHECKED">Is checked</option>
                            </select>
                            {field.condition.operator !== "CHECKED" ? (
                              <Input
                                className="h-9 text-xs"
                                placeholder="Expected answer"
                                value={String(field.condition.value ?? "")}
                                onChange={(event) =>
                                  updateField(field.id, {
                                    condition: { ...field.condition!, value: event.target.value }
                                  })
                                }
                              />
                            ) : <div />}
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
              <Button variant="secondary" onClick={addField}>
                <Plus className="h-4 w-4" />
                Add question
              </Button>
              {error ? <p className="text-sm text-clay">{error}</p> : null}
              <div className="flex gap-2">
                <Button type="submit" disabled={!fields.length}>Create form</Button>
                <Button variant="secondary" onClick={() => setBuilding(false)}>Cancel</Button>
              </div>
            </form>
          ) : activeForm ? (
            <div>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-semibold">{activeForm.title}</h3>
                  {activeForm.description ? <p className="mt-2 text-sm text-ink/55">{activeForm.description}</p> : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge className={activeForm.status === "OPEN" ? "bg-mint" : "bg-wheat"}>
                      {activeForm.status.toLowerCase()}
                    </Badge>
                    <Badge>{activeForm._count?.responses ?? 0} responses</Badge>
                    {activeForm.requiresApproval ? <Badge>approval</Badge> : null}
                    {activeForm.signatureRequired ? <Badge>signature</Badge> : null}
                    {activeForm.paymentRequired ? <Badge>{money(activeForm.paymentAmount, activeForm.paymentCurrency)}</Badge> : null}
                  </div>
                </div>
                {canManage ? (
                  <a
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-ink/10 bg-white px-3 text-sm font-medium hover:bg-mint"
                    href={`/api/forms/${activeForm.id}/export`}
                  >
                    <Download className="h-4 w-4" />
                    Export CSV
                  </a>
                ) : null}
              </div>
              {activeForm.status === "OPEN" ? (
                <form className="mt-5 space-y-4" onSubmit={submitResponse}>
                  {visibleFields.map((field) => (
                    <label key={field.id} className="block space-y-2 text-sm font-medium">
                      <span>{field.label}{field.required ? " *" : ""}</span>
                      {field.type === "LONG_TEXT" ? (
                        <Textarea
                          placeholder={field.placeholder}
                          required={field.required}
                          value={String(answers[field.id] ?? "")}
                          onChange={(event) => setAnswers((current) => ({ ...current, [field.id]: event.target.value }))}
                        />
                      ) : field.type === "CHOICE" ? (
                        <select
                          className="h-10 w-full rounded-md border border-ink/10 bg-white px-3"
                          required={field.required}
                          value={String(answers[field.id] ?? "")}
                          onChange={(event) => setAnswers((current) => ({ ...current, [field.id]: event.target.value }))}
                        >
                          <option value="">Choose an option</option>
                          {(field.options ?? []).map((option) => <option key={option}>{option}</option>)}
                        </select>
                      ) : field.type === "CHECKBOX" ? (
                        <input
                          className="h-5 w-5 accent-[#1F6F5B]"
                          type="checkbox"
                          checked={answers[field.id] === true}
                          onChange={(event) => setAnswers((current) => ({ ...current, [field.id]: event.target.checked }))}
                        />
                      ) : (
                        <Input
                          placeholder={field.placeholder}
                          required={field.required}
                          type={field.type === "EMAIL" ? "email" : field.type === "NUMBER" ? "number" : field.type === "DATE" ? "date" : "text"}
                          value={String(answers[field.id] ?? "")}
                          onChange={(event) => setAnswers((current) => ({ ...current, [field.id]: event.target.value }))}
                        />
                      )}
                    </label>
                  ))}
                  {activeForm.paymentRequired ? (
                    <div className="rounded-md bg-paper p-3">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        <WalletCards className="h-4 w-4 text-moss" />
                        Payment {money(activeForm.paymentAmount, activeForm.paymentCurrency)}
                      </p>
                      {activeForm.paymentUrl ? (
                        <a className="mt-2 inline-block text-sm font-medium text-moss underline" href={activeForm.paymentUrl} target="_blank">
                          Open secure payment page
                        </a>
                      ) : null}
                      <Input className="mt-3" name="paymentReference" placeholder="Payment reference" required />
                    </div>
                  ) : null}
                  {activeForm.signatureRequired ? (
                    <label className="block space-y-2 text-sm font-medium">
                      <span className="flex items-center gap-2"><Signature className="h-4 w-4 text-moss" />Typed signature *</span>
                      <Input name="signatureName" placeholder="Type your full legal name" required />
                    </label>
                  ) : null}
                  {error ? <p className="text-sm text-clay">{error}</p> : null}
                  {status ? <p className="rounded-md bg-mint px-3 py-2 text-sm">{status}</p> : null}
                  <Button type="submit">
                    <Send className="h-4 w-4" />
                    Submit response
                  </Button>
                </form>
              ) : (
                <div className="mt-6 flex items-center gap-2 rounded-md bg-paper px-3 py-4 text-sm text-ink/55">
                  <BarChart3 className="h-4 w-4 text-moss" />
                  This form is not currently accepting responses.
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-ink/55">Select a form or survey.</p>
          )}
        </div>
      </div>
    </section>
  );
}
