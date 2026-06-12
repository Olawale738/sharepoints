"use client";

import { BarChart3, Download, FileQuestion, Loader2, Plus, Send, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type FormField = {
  id: string;
  label: string;
  type: "TEXT" | "LONG_TEXT" | "EMAIL" | "NUMBER" | "DATE" | "CHOICE" | "CHECKBOX";
  required?: boolean;
  options?: string[];
};

type WorkspaceForm = {
  id: string;
  title: string;
  description?: string | null;
  status: "DRAFT" | "OPEN" | "CLOSED";
  fields: FormField[];
  responses?: Array<{ id: string }>;
  _count?: { responses: number };
};

export function FormsPanel({ workspaceId, canManage }: { workspaceId: string; canManage: boolean }) {
  const [forms, setForms] = useState<WorkspaceForm[]>([]);
  const [activeForm, setActiveForm] = useState<WorkspaceForm | null>(null);
  const [building, setBuilding] = useState(false);
  const [fields, setFields] = useState<FormField[]>([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  const loadForms = useCallback(async () => {
    const response = await fetch(`/api/workspaces/${workspaceId}/forms`);
    setLoading(false);

    if (!response.ok) return;
    const data = (await response.json()) as { forms: WorkspaceForm[] };
    setForms(data.forms);
    setActiveForm((current) => current ?? data.forms[0] ?? null);
  }, [workspaceId]);

  useEffect(() => {
    loadForms();
  }, [loadForms]);

  function addField() {
    setFields((current) => [
      ...current,
      { id: crypto.randomUUID(), label: "", type: "TEXT", required: false }
    ]);
  }

  async function createForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formData = new FormData(event.currentTarget);
    const response = await fetch(`/api/workspaces/${workspaceId}/forms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: String(formData.get("title")),
        description: String(formData.get("description") ?? ""),
        status: String(formData.get("status")),
        fields
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
  }

  async function submitResponse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeForm) return;
    setError("");
    setStatus("");
    const formData = new FormData(event.currentTarget);
    const answers = Object.fromEntries(
      activeForm.fields.map((field) => [
        field.id,
        field.type === "CHECKBOX" ? formData.get(field.id) === "on" : String(formData.get(field.id) ?? "")
      ])
    );
    const response = await fetch(`/api/forms/${activeForm.id}/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers })
    });
    const data = (await response.json().catch(() => null)) as { error?: string } | null;

    if (!response.ok) {
      setError(data?.error ?? "Response could not be submitted.");
      return;
    }

    setStatus("Your response has been saved.");
    event.currentTarget.reset();
    await loadForms();
  }

  return (
    <section className="overflow-hidden rounded-lg border border-ink/10 bg-white">
      <div className="flex items-center justify-between border-b border-ink/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <FileQuestion className="h-4 w-4 text-moss" />
          <h2 className="text-sm font-semibold">Forms and surveys</h2>
        </div>
        {canManage ? (
          <Button
            className="h-9"
            variant="secondary"
            onClick={() => {
              setBuilding(true);
              setActiveForm(null);
              setFields([{ id: crypto.randomUUID(), label: "", type: "TEXT" }]);
            }}
          >
            <Plus className="h-4 w-4" />
            New form
          </Button>
        ) : null}
      </div>
      <div className="grid min-h-[26rem] md:grid-cols-[16rem_minmax(0,1fr)]">
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
            <form className="space-y-3" onSubmit={createForm}>
              <Input name="title" placeholder="Form or survey title" required />
              <Textarea name="description" placeholder="Purpose and instructions" />
              <select className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm" name="status">
                <option value="DRAFT">Draft</option>
                <option value="OPEN">Open for responses</option>
                <option value="CLOSED">Closed</option>
              </select>
              <div className="space-y-2">
                {fields.map((field, index) => (
                  <div key={field.id} className="grid gap-2 rounded-md border border-ink/10 bg-paper p-3 md:grid-cols-[1fr_10rem_auto]">
                    <Input
                      placeholder={`Question ${index + 1}`}
                      value={field.label}
                      onChange={(event) =>
                        setFields((current) =>
                          current.map((item) => (item.id === field.id ? { ...item, label: event.target.value } : item))
                        )
                      }
                      required
                    />
                    <select
                      className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm"
                      value={field.type}
                      onChange={(event) =>
                        setFields((current) =>
                          current.map((item) =>
                            item.id === field.id ? { ...item, type: event.target.value as FormField["type"] } : item
                          )
                        )
                      }
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
                    {field.type === "CHOICE" ? (
                      <Input
                        className="md:col-span-3"
                        placeholder="Options separated by commas"
                        onChange={(event) =>
                          setFields((current) =>
                            current.map((item) =>
                              item.id === field.id
                                ? { ...item, options: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) }
                                : item
                            )
                          )
                        }
                      />
                    ) : null}
                    <label className="flex items-center gap-2 text-xs text-ink/60 md:col-span-3">
                      <input
                        type="checkbox"
                        checked={Boolean(field.required)}
                        onChange={(event) =>
                          setFields((current) =>
                            current.map((item) =>
                              item.id === field.id ? { ...item, required: event.target.checked } : item
                            )
                          )
                        }
                      />
                      Required response
                    </label>
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
                  <div className="mt-2 flex gap-2">
                    <Badge className={activeForm.status === "OPEN" ? "bg-mint" : "bg-wheat"}>
                      {activeForm.status.toLowerCase()}
                    </Badge>
                    <Badge>{activeForm._count?.responses ?? 0} responses</Badge>
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
                  {activeForm.fields.map((field) => (
                    <label key={field.id} className="block space-y-2 text-sm font-medium">
                      <span>{field.label}{field.required ? " *" : ""}</span>
                      {field.type === "LONG_TEXT" ? (
                        <Textarea name={field.id} required={field.required} />
                      ) : field.type === "CHOICE" ? (
                        <select
                          className="h-10 w-full rounded-md border border-ink/10 bg-white px-3"
                          name={field.id}
                          required={field.required}
                        >
                          <option value="">Choose an option</option>
                          {(field.options ?? []).map((option) => <option key={option}>{option}</option>)}
                        </select>
                      ) : field.type === "CHECKBOX" ? (
                        <input className="h-5 w-5 accent-[#1F6F5B]" name={field.id} type="checkbox" />
                      ) : (
                        <Input
                          name={field.id}
                          required={field.required}
                          type={field.type === "EMAIL" ? "email" : field.type === "NUMBER" ? "number" : field.type === "DATE" ? "date" : "text"}
                        />
                      )}
                    </label>
                  ))}
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
