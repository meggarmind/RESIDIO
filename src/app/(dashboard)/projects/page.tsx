import { Suspense } from 'react';
import { getProjects } from '@/actions/projects/get-projects';
import { ProjectsClient } from '@/components/projects/projects-client';
import { EnhancedPageHeader } from '@/components/dashboard/enhanced-stat-card';
import { Building2 } from 'lucide-react';

export default async function ProjectsPage() {
    const projects = await getProjects();

    return (
        <div className="space-y-6 flex-1 px-4 py-8 md:px-8">
            <EnhancedPageHeader
                title="Capital Projects"
                description="Monitor and manage major estate improvement works and infrastructure projects."
                icon={Building2}
            />

            <ProjectsClient initialProjects={projects} />
        </div>
    );
}
