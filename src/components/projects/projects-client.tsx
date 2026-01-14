'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, LayoutGrid, List as ListIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { formatCurrency } from '@/lib/utils';
import Link from 'next/link';

interface ProjectsClientProps {
    initialProjects: any[];
}

export function ProjectsClient({ initialProjects }: ProjectsClientProps) {
    const [projects] = useState(initialProjects);

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">Ongoing Projects</h2>
                <Button className="gap-2">
                    <Plus className="h-4 w-4" />
                    New Project
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects.length === 0 ? (
                    <Card className="col-span-full py-12 text-center text-muted-foreground">
                        No capital projects tracked yet.
                    </Card>
                ) : (
                    projects.map((project) => (
                        <Link key={project.id} href={`/projects/${project.id}`}>
                            <Card className="hover:border-primary transition-colors cursor-pointer h-full">
                                <CardHeader className="pb-2">
                                    <div className="flex justify-between items-start">
                                        <CardTitle className="text-lg">{project.name}</CardTitle>
                                        <Badge variant={project.status === 'active' ? 'success' : 'secondary'}>
                                            {project.status.replace('_', ' ')}
                                        </Badge>
                                    </div>
                                    <CardDescription className="line-clamp-2 min-h-[40px]">
                                        {project.description || 'No description provided.'}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-xs font-medium">
                                            <span>Progress</span>
                                            <span>{project.current_progress}%</span>
                                        </div>
                                        <Progress value={project.current_progress} className="h-2" />
                                    </div>

                                    <div className="flex justify-between items-end">
                                        <div className="space-y-1">
                                            <p className="text-[10px] uppercase text-muted-foreground font-semibold">Budget</p>
                                            <p className="text-sm font-bold">{formatCurrency(project.total_budget)}</p>
                                        </div>
                                        <div className="text-right space-y-1">
                                            <p className="text-[10px] uppercase text-muted-foreground font-semibold">Ends</p>
                                            <p className="text-xs">{project.end_date ? new Date(project.end_date).toLocaleDateString() : 'TBD'}</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </Link>
                    ))
                )}
            </div>
        </div>
    );
}
