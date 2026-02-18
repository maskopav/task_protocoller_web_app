import { useNavigate, useParams } from "react-router-dom";
import { useContext } from "react";
import { ProtocolContext } from "../context/ProtocolContext";
import { useMappings } from "../context/MappingContext";
import { getProtocolById } from "../api/protocols";

export function useProtocolActions() {
  const { setSelectedProtocol } = useContext(ProtocolContext);
  const { mappings } = useMappings();
  const navigate = useNavigate();
  const { projectId } = useParams();

  // ----- VIEW PROTOCOL (Participant view/test mode)
  async function viewProtocol(protocolId) {
    console.log("Getting protocolId:", protocolId);

    try {
      const rawProtocol = await getProtocolById(protocolId);
      const mappedProtocol = mapProtocolWithNames(rawProtocol, mappings);

      mappedProtocol.projectId = projectId;

      setSelectedProtocol(mappedProtocol);

      navigate("/participant/test", {
        state: {
          protocol: mappedProtocol,
          testingMode: true,
          editingMode: false,
          returnTo: "dashboard", 
        },
      });
    } catch (error) {
      console.error("Error loading protocol:", error);
      alert("Failed to load protocol");
    }
  }

  // ----- EDIT PROTOCOL (Admin edit mode)
  async function editProtocol(protocolId) {
    try {
      const rawProtocol = await getProtocolById(protocolId);
      const mappedProtocol = mapProtocolWithNames(rawProtocol, mappings);

      setSelectedProtocol(mappedProtocol);

      // navigate with edit flag
      navigate(`/admin/projects/${projectId}/protocols/${protocolId}`, {
        state: {
          protocol: mappedProtocol,
          testingMode: true, // stays true to preview tasks
          editingMode: true,
          returnTo: "editor",
        },
      });
    } catch (error) {
      console.error("Error editing protocol:", error);
      alert("Failed to edit protocol");
    }
  };

    // ----- DUPLICATE PROTOCOL (Prefilled protocol, saved as new one)
    async function duplicateProtocol(protocolId) {
      try {
        const rawProtocol = await getProtocolById(protocolId);
        const mappedProtocol = mapProtocolWithNames(rawProtocol, mappings);
  
        setSelectedProtocol(mappedProtocol);
  
        mappedProtocol.id = undefined;
        mappedProtocol.protocol_group_id = undefined;
        mappedProtocol.version = 1;

        // navigate with edit flag
        navigate(`/admin/projects/${projectId}/protocols/${protocolId}`, {
          state: {
            protocol: mappedProtocol,
            testingMode: true, // stays true to preview tasks
            editingMode: false,
          },
        });
      } catch (error) {
        console.error("Error duplicating protocol:", error);
        alert("Failed to duplicate protocol");
      }
    };
  return { viewProtocol, editProtocol, duplicateProtocol };
}

/**
 * Reverse-map backend IDs into readable protocol object.
 */
function mapProtocolWithNames(raw, mappings) {
  if (!raw || !mappings) return null;

  const language = mappings.languages.find(l => l.id === raw.language_id);
  const mappedTasks = raw.tasks.map(t => {
    const taskDef = mappings.tasks.find(task => task.id === t.task_id);
    return {
      ...t.params,
      category: taskDef?.category || `unknown(${t.task_id})`,
      task_order: t.task_order,
    };
  });

  return {
    id: raw.id,
    protocol_group_id: raw.protocol_group_id,
    name: raw.name,
    version: raw.version,
    description: raw.description,
    language: language?.code || "unknown",
    randomization: raw.randomization || {}, 
    info_text: raw.info_text || "",
    consent_text: raw.consent_text || "",
    tasks: mappedTasks,
  };
}
