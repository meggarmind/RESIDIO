import { getProjects } from '@/actions/projects/get-projects';
import { ProjectsClient } from '@/components/projects/projects-client';

export default async function ProjectsPage() {
    const projects = await getProjects();

    return (
        <ProjectsClient initialProjects={projects} />
    );
}
