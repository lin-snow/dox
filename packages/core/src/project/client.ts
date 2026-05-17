import type { Fetcher } from "../http";
import type { Project, ProjectMember, ProjectPatch } from "./domain";

export class ProjectClient {
  constructor(
    private readonly fetcher: Fetcher,
    private readonly base: string,
  ) {}

  async list(): Promise<Project[]> {
    const res = await this.fetcher(new Request(`${this.base}/v1/projects`));
    const body = (await res.json()) as { projects?: Project[] };
    return body.projects ?? [];
  }

  async get(id: string): Promise<Project> {
    const res = await this.fetcher(
      new Request(`${this.base}/v1/projects/${encodeURIComponent(id)}`),
    );
    return (await res.json()) as Project;
  }

  async create(args: {
    name: string;
    description?: string;
    color?: string;
  }): Promise<Project> {
    const res = await this.fetcher(this.json("POST", "/v1/projects", args));
    return (await res.json()) as Project;
  }

  async update(id: string, patch: ProjectPatch): Promise<Project> {
    const res = await this.fetcher(
      this.json("PATCH", `/v1/projects/${encodeURIComponent(id)}`, patch),
    );
    return (await res.json()) as Project;
  }

  async remove(id: string): Promise<void> {
    await this.fetcher(
      new Request(`${this.base}/v1/projects/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),
    );
  }

  async listMembers(projectId: string): Promise<ProjectMember[]> {
    const res = await this.fetcher(
      new Request(
        `${this.base}/v1/projects/${encodeURIComponent(projectId)}/members`,
      ),
    );
    const body = (await res.json()) as { members?: ProjectMember[] };
    return body.members ?? [];
  }

  async removeMember(projectId: string, userId: string): Promise<void> {
    await this.fetcher(
      new Request(
        `${this.base}/v1/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}`,
        { method: "DELETE" },
      ),
    );
  }

  private json(method: string, path: string, body: object): Request {
    return new Request(`${this.base}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
}
