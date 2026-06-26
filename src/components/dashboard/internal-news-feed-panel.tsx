"use client";

import { MessageCircle, Pin, Plus, Send, ThumbsUp } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type NewsPost = {
  id: string;
  title: string;
  body: string;
  audienceType: string;
  pinned: boolean;
  authorId: string;
  createdAt: string;
};
type NewsComment = { id: string; postId: string; body: string; authorId: string; createdAt: string };
type NewsReaction = { id: string; postId: string; reaction: string; userId: string };

type NewsData = {
  posts: NewsPost[];
  comments: NewsComment[];
  reactions: NewsReaction[];
  canManage: boolean;
};

const emptyNews: NewsData = { posts: [], comments: [], reactions: [], canManage: false };

function label(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}

export function InternalNewsFeedPanel() {
  const [data, setData] = useState<NewsData>(emptyNews);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const response = await fetch("/api/news-feed");
    const body = (await response.json().catch(() => null)) as (NewsData & { error?: string }) | null;
    setLoading(false);
    if (!response.ok || !body) {
      setError(body?.error ?? "News feed could not be loaded.");
      return;
    }
    setData(body);
  }

  useEffect(() => {
    void load();
  }, []);

  const commentsByPost = useMemo(() => {
    const grouped = new Map<string, NewsComment[]>();
    for (const comment of data.comments) grouped.set(comment.postId, [...(grouped.get(comment.postId) ?? []), comment]);
    return grouped;
  }, [data.comments]);

  const reactionsByPost = useMemo(() => {
    const grouped = new Map<string, NewsReaction[]>();
    for (const reaction of data.reactions) grouped.set(reaction.postId, [...(grouped.get(reaction.postId) ?? []), reaction]);
    return grouped;
  }, [data.reactions]);

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    const response = await fetch("/api/news-feed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: values.title,
        body: values.body,
        audienceType: values.audienceType,
        pinned: values.pinned === "on"
      })
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      setError(body?.error ?? "News post could not be published.");
      return;
    }
    form.reset();
    setNotice("News post published.");
    await load();
  }

  async function comment(postId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = event.currentTarget;
    const body = String(new FormData(form).get("body") ?? "");
    const response = await fetch(`/api/news-feed/${postId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body })
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      setError(payload?.error ?? "Comment could not be added.");
      return;
    }
    form.reset();
    await load();
  }

  async function react(postId: string, reaction: string) {
    setError("");
    const response = await fetch(`/api/news-feed/${postId}/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reaction })
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      setError(payload?.error ?? "Reaction could not be saved.");
      return;
    }
    await load();
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[24rem_minmax(0,1fr)]">
      <section className="rounded-lg border border-ink/10 bg-white p-4">
        <h2 className="font-semibold">Publish update</h2>
        {data.canManage ? (
          <form className="mt-4 space-y-3" onSubmit={publish}>
            <Input name="title" placeholder="News title" required />
            <select className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm" name="audienceType">
              <option value="LETW_WIDE">LETW-wide</option>
              <option value="LEADERSHIP">Leadership</option>
              <option value="ORGANIZATION_UNIT">Branch or ministry update</option>
              <option value="WORKSPACE">Workspace update</option>
            </select>
            <Textarea name="body" placeholder="Share the update..." required />
            <label className="flex items-center gap-2 text-sm">
              <input name="pinned" type="checkbox" /> Pin this update
            </label>
            <Button className="w-full" type="submit"><Plus className="h-4 w-4" />Publish</Button>
          </form>
        ) : (
          <p className="mt-3 rounded-md bg-paper p-3 text-sm text-ink/55">Only administrators can publish official LETW news.</p>
        )}
      </section>

      <section className="space-y-4">
        {notice ? <p className="rounded-md bg-mint px-4 py-3 text-sm text-moss">{notice}</p> : null}
        {error ? <p className="rounded-md bg-clay/10 px-4 py-3 text-sm text-clay">{error}</p> : null}
        {loading ? <p className="rounded-lg border border-ink/10 bg-white p-6 text-sm text-ink/55">Loading news feed...</p> : null}
        {!loading && !data.posts.length ? <p className="rounded-lg border border-ink/10 bg-white p-6 text-sm text-ink/55">No internal news yet.</p> : null}
        {data.posts.map((post) => {
          const comments = commentsByPost.get(post.id) ?? [];
          const reactions = reactionsByPost.get(post.id) ?? [];
          return (
            <article className="rounded-lg border border-ink/10 bg-white p-4" key={post.id}>
              <div className="flex flex-wrap items-center gap-2">
                {post.pinned ? <Badge><Pin className="mr-1 h-3 w-3" />Pinned</Badge> : null}
                <Badge>{label(post.audienceType)}</Badge>
                <span className="text-xs text-ink/45">{new Date(post.createdAt).toLocaleString("en-GB")}</span>
              </div>
              <h2 className="mt-3 text-xl font-semibold">{post.title}</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink/70">{post.body}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {["LIKE", "AMEN", "PRAYING", "CELEBRATE"].map((reaction) => (
                  <button
                    className="inline-flex h-8 items-center gap-1 rounded-md border border-ink/10 px-2 text-xs hover:bg-mint/50"
                    key={reaction}
                    type="button"
                    onClick={() => void react(post.id, reaction)}
                  >
                    <ThumbsUp className="h-3 w-3" /> {label(reaction)} {reactions.filter((item) => item.reaction === reaction).length}
                  </button>
                ))}
              </div>
              <div className="mt-4 rounded-md bg-paper p-3">
                <p className="flex items-center gap-2 text-sm font-medium"><MessageCircle className="h-4 w-4" />Comments ({comments.length})</p>
                <div className="mt-3 space-y-2">
                  {comments.slice(-5).map((item) => (
                    <p className="rounded-md bg-white px-3 py-2 text-sm text-ink/70" key={item.id}>{item.body}</p>
                  ))}
                </div>
                <form className="mt-3 flex gap-2" onSubmit={(event) => void comment(post.id, event)}>
                  <Input name="body" placeholder="Write a comment" required />
                  <Button type="submit"><Send className="h-4 w-4" /></Button>
                </form>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
