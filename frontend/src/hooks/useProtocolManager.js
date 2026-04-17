// src/hooks/useProtocolManager.js
import { saveProtocolToBackend } from "../api/protocols";
import { useMappings } from "../context/MappingContext";

export function useProtocolManager() {
  const { mappings } = useMappings();

  async function saveNewProtocol(tasks, selectedProtocol, projectId, editingMode) {
    if (!projectId) throw new Error("Missing projectId when saving protocol");
    const langCodes = Array.isArray(selectedProtocol.language) 
      ? selectedProtocol.language 
      : [selectedProtocol.language || "en"];
      
    // 2. Map the string codes ('en', 'cs') to their integer database IDs (1, 2)
    const languageIds = langCodes.map(code => {
      const match = mappings.languages.find(l => l.code === code);
      return match ? match.id : 1; // Fallback to 1 (English) if not found
    });
    const version = editingMode? selectedProtocol.versionNext : 1;

    const protocolData = {
      protocol_group_id: editingMode? selectedProtocol.protocol_group_id : undefined,
      name: selectedProtocol.name,
      language_id: languageIds,
      description: selectedProtocol.description,
      version: version,
      created_by: 1,
      randomization: selectedProtocol.randomization,
      tasks: tasks.map((task, index) => ({
        task_id: mappings.tasks.find(t => t.category === task.category)?.id,
        task_order: index + 1,
        params: task,
      })),
      project_id: Number(projectId),  
      editingMode,
      info_text: selectedProtocol.info_text,
      consent_text: selectedProtocol.consent_text
    };
    console.log("Saving protocol:", protocolData);
    const result = await saveProtocolToBackend(protocolData);
    return result;
  }

  return { saveNewProtocol };
}
