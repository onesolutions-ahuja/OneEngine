// Integration mapping fields are object/field metadata; no business field catalogue is hardcoded in the client.
export function getIntegrationFieldCatalogue(metadata=[]){
 return (Array.isArray(metadata)?metadata:[]).filter(entry=>entry&&entry.path).map(entry=>({...entry}));
}
export default {getIntegrationFieldCatalogue};
