import { tr } from "../i18n";
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { Button, Card, Field, Label, Notice, Sheet, Tag, ToggleRow } from "../components/UI";
import { MarkdownText } from "../components/MarkdownText";
import { PanelProps, usePanelAction } from "./shared";
interface Skill { name: string; description: string; content?: string; source?: string; provider?: string; invocation: { modelInvocable: boolean; userInvocable: boolean }; }
interface Library { revision: number; skills: Skill[] }
export function SkillsPanel(props: PanelProps & { conversationId?: string; onChoose?: (name: string) => void }) {
  const action = usePanelAction(props);
  const [directory, setDirectory] = useState<{available: boolean; skills: Skill[]} | null>(null);
  const [library, setLibrary] = useState<Library | null>(null);
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<Skill | null>(null);
  const [editor, setEditor] = useState(false);
  const [deleting, setDeleting] = useState<Skill | null>(null);
  const [editingName, setEditingName] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [model, setModel] = useState(false);
  const [user, setUser] = useState(true);
  async function load() {
    const value = await props.client.action<{available: boolean; skills: Skill[]}>("skills-list", { conversationId: props.conversationId });
    setDirectory(value);
    if (value.available) setLibrary(await props.client.action<Library>("skills-library", {}));
  }
  useEffect(() => { if (props.online) void action.run(load); }, [props.client, props.online, props.conversationId]);
  function edit(skill?: Skill) { setEditingName(skill?.name || ""); setName(skill?.name || ""); setDescription(skill?.description || ""); setContent(skill?.content || ""); setModel(skill?.invocation.modelInvocable || false); setUser(skill?.invocation.userInvocable ?? true); setEditor(true); }
  const disabled = !props.online || action.busy || !!props.team.readOnly;
  const entries = directory?.skills.filter(skill => `${skill.name} ${skill.description}`.toLowerCase().includes(query.toLowerCase())) || [];
  return <View style={{gap:16}}><Label>{tr("Skills")}</Label>
    <Label muted>{props.conversationId ? tr("Skills available in this conversation. Select one to add it to your draft, then send when ready.") : tr("Skills follow each Bot's working directory and conversation scope. Open a conversation to use them.")}</Label>
    <Notice error text={action.error}/>{!props.online && <Notice text={tr("Connect to your host to refresh or manage skills.")}/>}
    <Button secondary title={tr("Refresh skills")} disabled={!props.online || action.busy} onPress={() => action.run(load)}/>
    {directory?.available === false && <Notice text={tr("The Skills service is not enabled on this host.")}/>}
    <Field label={tr("Search skills")} value={query} onChangeText={setQuery}/>
    {entries.map(skill => <Card key={skill.name}><Label>{skill.name}</Label><Label muted>{skill.description}</Label>
      <View style={{flexDirection:"row",gap:8,flexWrap:"wrap"}}>{skill.invocation.modelInvocable && <Tag>{tr("Model can invoke")}</Tag>}{skill.invocation.userInvocable && <Tag>{tr("You can invoke")}</Tag>}</View>
      <Label muted>{[skill.provider,skill.source].filter(Boolean).join(" · ")}</Label>
      {skill.invocation.userInvocable && <><Button secondary title={tr("View instructions")} disabled={!props.online || action.busy} onPress={() => action.run(async () => setPreview(await props.client.action<Skill>("skills-get", {name:skill.name,conversationId:props.conversationId})))}/>
        {props.onChoose && <Button title={tr("Use /{name}", {name:skill.name})} disabled={disabled} onPress={() => props.onChoose?.(skill.name)}/>}</>}
    </Card>)}
    {!entries.length && directory?.available && <Notice text={tr("No matching skills.")}/>}
    {!!library && <><Label large>{tr("Your skill library")}</Label><Label muted>{tr("Saved on this host. Project skills with the same name take priority. Project and plugin files stay unchanged.")}</Label><Button title={tr("New skill")} disabled={disabled} onPress={() => edit()}/>
      {library.skills.map(skill => <Card key={skill.name}><Label>{skill.name}</Label><Label muted>{skill.description}</Label><View style={{flexDirection:"row",gap:8}}><Button secondary title={tr("Edit")} disabled={disabled} onPress={() => edit(skill)}/><Button secondary danger title={tr("Delete")} disabled={disabled} onPress={() => setDeleting(skill)}/></View></Card>)}</>}
    <Sheet title={preview?.name || tr("Skill instructions")} visible={!!preview} onClose={() => setPreview(null)}><MarkdownText text={preview?.content || ""}/></Sheet>
    <Sheet title={tr("Edit skill")} visible={editor} onClose={() => setEditor(false)}><Field label={tr("Name (kebab-case)")} editable={!editingName} value={name} onChangeText={setName} autoCapitalize="none" maxLength={100}/><Field label={tr("Description")} value={description} onChangeText={setDescription} multiline maxLength={2000}/><Field label={tr("Markdown instructions")} value={content} onChangeText={setContent} multiline maxLength={65536} style={{minHeight:180}}/>
      <ToggleRow title={tr("Allow model invocation")} value={model} onChange={setModel}/><ToggleRow title={tr("Allow user invocation")} value={user} onChange={setUser}/><Notice error text={action.error}/>
      <Button title={tr("Save")} disabled={disabled || !name || !description.trim() || !content.trim()} onPress={async () => { const result = await action.run(async () => { await props.client.action("skills-save", {name,description,content,modelInvocable:model,userInvocable:user,expectedRevision:library?.revision}); await load(); }); if(result.ok) setEditor(false); }}/>
    </Sheet>
    <Sheet title={tr("Delete saved skill")} visible={!!deleting} onClose={() => setDeleting(null)}><Label>{tr("Delete /{name}? Existing conversations will stay unchanged.",{name:deleting?.name || ""})}</Label><Notice error text={action.error}/><Button danger title={tr("Confirm deletion")} disabled={disabled} onPress={async () => {const result=await action.run(async () => {await props.client.action("skills-delete",{name:deleting?.name,expectedRevision:library?.revision});await load();});if(result.ok)setDeleting(null);}}/></Sheet>
  </View>;
}
