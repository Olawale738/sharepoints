import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { getLeadershipDocuments, uploadLeadershipDocument } from "@/lib/leadership-documents";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const documents = await getLeadershipDocuments(user.id);
    return ok({ documents });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const formData = await request.formData();
    const file = formData.get("file");
    const title = String(formData.get("title") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const category = String(formData.get("category") ?? "").trim();

    if (!(file instanceof File)) {
      throw new ApiError(422, "A file is required.");
    }
    if (title.length < 3) {
      throw new ApiError(422, "Document title is required.");
    }

    const document = await uploadLeadershipDocument({
      userId: user.id,
      file,
      title,
      description,
      category
    });

    return ok({ document }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
