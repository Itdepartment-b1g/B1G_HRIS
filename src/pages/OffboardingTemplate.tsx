import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, ChevronDown, ChevronUp, Loader2, Plus, Trash2, UserRound } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  dbMessage,
  fetchTemplate,
  personName,
  syncTemplateDepartments,
  type TemplateSection,
} from '@/lib/offboarding';

const OffboardingTemplate = () => {
  const navigate = useNavigate();
  const [sections, setSections] = useState<TemplateSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [deleteSection, setDeleteSection] = useState<TemplateSection | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSections(await fetchTemplate());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load the checklist');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const sync = async () => {
    setSyncing(true);
    try {
      const added = await syncTemplateDepartments();
      toast.success(added > 0 ? `Added ${added} department${added === 1 ? '' : 's'} from master data.` : 'Every department is already on the checklist.');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add departments');
    }
    setSyncing(false);
  };

  const saveTitle = async (section: TemplateSection, title: string) => {
    const next = title.trim();
    if (!next || next === section.title) return;
    const { error } = await supabase.from('clearance_template_sections').update({ title: next }).eq('id', section.id);
    if (error) toast.error(dbMessage(error, 'Failed to rename the section'));
    else setSections((current) => current.map((row) => (row.id === section.id ? { ...row, title: next } : row)));
  };

  const saveItem = async (sectionId: string, itemId: string, label: string, previous: string) => {
    const next = label.trim();
    if (!next || next === previous) return;
    const { error } = await supabase.from('clearance_template_items').update({ label: next }).eq('id', itemId);
    if (error) toast.error(dbMessage(error, 'Failed to rename the item'));
    else {
      setSections((current) => current.map((section) => (
        section.id === sectionId
          ? { ...section, items: section.items.map((item) => (item.id === itemId ? { ...item, label: next } : item)) }
          : section
      )));
    }
  };

  const addItem = async (sectionId: string) => {
    const label = (drafts[sectionId] ?? '').trim();
    if (!label) return;
    const section = sections.find((row) => row.id === sectionId);
    const sortOrder = section ? section.items.length : 0;
    const { data, error } = await supabase
      .from('clearance_template_items')
      .insert({ section_id: sectionId, label, sort_order: sortOrder })
      .select('id, label, sort_order')
      .single();
    if (error) {
      toast.error(dbMessage(error, 'Failed to add the item'));
      return;
    }
    setDrafts((current) => ({ ...current, [sectionId]: '' }));
    setSections((current) => current.map((row) => (
      row.id === sectionId ? { ...row, items: [...row.items, data] } : row
    )));
  };

  const removeItem = async (sectionId: string, itemId: string) => {
    const { error } = await supabase.from('clearance_template_items').delete().eq('id', itemId);
    if (error) toast.error(dbMessage(error, 'Failed to remove the item'));
    else setSections((current) => current.map((section) => (
      section.id === sectionId ? { ...section, items: section.items.filter((item) => item.id !== itemId) } : section
    )));
  };

  const moveItem = async (section: TemplateSection, index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= section.items.length) return;
    const next = [...section.items];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    const updates = next.map((item, order) =>
      supabase.from('clearance_template_items').update({ sort_order: order }).eq('id', item.id)
    );
    const results = await Promise.all(updates);
    const failed = results.find((result) => result.error);
    if (failed?.error) toast.error(dbMessage(failed.error, 'Failed to reorder items'));
    else setSections((current) => current.map((row) => (
      row.id === section.id ? { ...row, items: next.map((item, order) => ({ ...item, sort_order: order })) } : row
    )));
  };

  const moveSection = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    const results = await Promise.all(
      next.map((section, order) => supabase.from('clearance_template_sections').update({ sort_order: order }).eq('id', section.id))
    );
    const failed = results.find((result) => result.error);
    if (failed?.error) toast.error(dbMessage(failed.error, 'Failed to reorder sections'));
    else setSections(next.map((section, order) => ({ ...section, sort_order: order })));
  };

  const confirmDeleteSection = async () => {
    if (!deleteSection) return;
    const { error } = await supabase.from('clearance_template_sections').delete().eq('id', deleteSection.id);
    if (error) toast.error(dbMessage(error, 'Failed to remove the department'));
    else setSections((current) => current.filter((section) => section.id !== deleteSection.id));
    setDeleteSection(null);
  };

  const itemCount = sections.reduce((sum, section) => sum + section.items.length, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => navigate('/dashboard/offboarding')}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to offboarding
          </Button>
          <h1 className="text-2xl font-bold">Clearance checklist</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Build the form that department heads sign when an employee resigns. HR copies this list each time a clearance starts.
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
          <Button onClick={sync} disabled={syncing}>
            {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
            Add departments from master data
          </Button>
          <p className="text-xs text-muted-foreground max-w-xs sm:text-right">
            Adds any department that is not on this checklist yet. It does not remove sections you already edited.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">1. Section</p>
          <p className="text-sm mt-1">One block for the immediate superior, and one block for each department that must clear the employee.</p>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">2. Items</p>
          <p className="text-sm mt-1">The things that person checks off, such as a badge, a phone, or a turnover list. They sign each item.</p>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">3. Saving</p>
          <p className="text-sm mt-1">A name saves when you click outside the box. A clearance already in progress keeps its own copy.</p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
          Loading checklist
        </p>
      ) : sections.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-sm text-center space-y-2">
            <p className="font-medium">No sections yet</p>
            <p className="text-muted-foreground">
              Use “Add departments from master data.” Set a department head under Master Data → Departments so that person is asked to sign.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {sections.length} section{sections.length === 1 ? '' : 's'} · {itemCount} item{itemCount === 1 ? '' : 's'} to clear
          </p>
          {sections.map((section, index) => {
            const isSuperior = section.section_kind === 'immediate_superior';
            const signerName = isSuperior
              ? null
              : section.department?.head
                ? personName(section.department.head)
                : null;
            return (
              <Card key={section.id} className="overflow-hidden">
                <div className={cn('px-4 py-3 border-b flex flex-wrap items-center justify-between gap-2', isSuperior ? 'bg-sky-50' : 'bg-muted/40')}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Section {index + 1}</span>
                    <Badge variant="outline" className={isSuperior ? 'border-sky-200 bg-white text-sky-800' : 'bg-white'}>
                      {isSuperior ? 'Immediate superior' : 'Department'}
                    </Badge>
                    {!isSuperior && !signerName && (
                      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">No department head yet</Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">Section order</span>
                    <Button variant="outline" size="sm" disabled={index === 0} onClick={() => moveSection(index, -1)}>
                      <ChevronUp className="h-4 w-4 mr-1" />
                      Move up
                    </Button>
                    <Button variant="outline" size="sm" disabled={index === sections.length - 1} onClick={() => moveSection(index, 1)}>
                      <ChevronDown className="h-4 w-4 mr-1" />
                      Move down
                    </Button>
                    {section.section_kind === 'department' && (
                      <Button variant="outline" size="sm" onClick={() => setDeleteSection(section)}>
                        <Trash2 className="h-4 w-4 mr-1" />
                        Remove section
                      </Button>
                    )}
                  </div>
                </div>
                <CardContent className="pt-4 space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor={`section-name-${section.id}`}>Name on the clearance form</Label>
                      <Input
                        id={`section-name-${section.id}`}
                        defaultValue={section.title}
                        key={`${section.id}-${section.title}`}
                        onBlur={(event) => saveTitle(section, event.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">This heading is what the signer sees on the employee’s form.</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Who must sign</Label>
                      <div className="flex items-start gap-2 rounded-md border bg-muted/30 px-3 py-2 min-h-10">
                        <UserRound className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                        <div className="text-sm">
                          {isSuperior ? (
                            <>
                              <p className="font-medium">The employee’s immediate superior</p>
                              <p className="text-xs text-muted-foreground mt-0.5">Taken from the supervisor on the employee record when HR starts the clearance.</p>
                            </>
                          ) : signerName ? (
                            <>
                              <p className="font-medium">{signerName}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Department head{section.department?.name ? ` of ${section.department.name}` : ''}. Change the head under Master Data → Departments.
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="font-medium text-amber-800">No one is assigned yet</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Assign a department head under Master Data → Departments. Until then, HR can sign this section.
                              </p>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div>
                      <p className="text-sm font-medium">Items to clear</p>
                      <p className="text-xs text-muted-foreground">Each row is one thing that must be returned or finished before this section is signed.</p>
                    </div>
                    {section.items.length === 0 && (
                      <p className="text-sm text-amber-700 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                        This section has no items, so it will not be copied onto a new clearance. Add at least one item.
                      </p>
                    )}
                    {section.items.map((item, itemIndex) => (
                      <div key={item.id} className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-end">
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">Order</Label>
                          <div className="flex gap-1">
                            <Button variant="outline" size="sm" disabled={itemIndex === 0} onClick={() => moveItem(section, itemIndex, -1)}>
                              <ChevronUp className="h-3.5 w-3.5 mr-1" />
                              Up
                            </Button>
                            <Button variant="outline" size="sm" disabled={itemIndex === section.items.length - 1} onClick={() => moveItem(section, itemIndex, 1)}>
                              <ChevronDown className="h-3.5 w-3.5 mr-1" />
                              Down
                            </Button>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`item-${item.id}`}>Item {itemIndex + 1}</Label>
                          <Input
                            id={`item-${item.id}`}
                            defaultValue={item.label}
                            key={`${item.id}-${item.label}`}
                            onBlur={(event) => saveItem(section.id, item.id, event.target.value, item.label)}
                          />
                        </div>
                        <Button variant="outline" size="sm" className="sm:mb-0.5" onClick={() => removeItem(section.id, item.id)}>
                          <Trash2 className="h-4 w-4 mr-1" />
                          Remove item
                        </Button>
                      </div>
                    ))}
                    <form
                      className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end pt-1"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void addItem(section.id);
                      }}
                    >
                      <div className="space-y-1.5">
                        <Label htmlFor={`new-item-${section.id}`}>Add an item</Label>
                        <Input
                          id={`new-item-${section.id}`}
                          value={drafts[section.id] ?? ''}
                          onChange={(event) => setDrafts((current) => ({ ...current, [section.id]: event.target.value }))}
                          placeholder="Example: Company ID, laptop, pending tasks"
                        />
                      </div>
                      <Button type="submit" variant="outline">
                        <Plus className="h-4 w-4 mr-1" />
                        Add item
                      </Button>
                    </form>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!deleteSection} onOpenChange={(open) => { if (!open) setDeleteSection(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleteSection?.title}?</AlertDialogTitle>
            <AlertDialogDescription>
              New clearances will no longer include this department. Clearances already in progress keep their own copy.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteSection}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default OffboardingTemplate;
