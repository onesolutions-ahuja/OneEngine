import CustomPageBuilder from "../settings/Platform/CustomPageBuilder.jsx";

/*
 * GPT Page Builder is the canonical metadata Page Builder surfaced from the
 * Developer area. It deliberately shares the same saved page definition,
 * component registry, WYSIWYG renderer and action/Flow metadata contract as
 * the standard Page Builder.
 */
export default function GPTPageBuilder(props) {
  return <CustomPageBuilder {...props} />;
}
