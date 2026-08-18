export default () => {
  if (typeof window === 'undefined') {
    throw new Error('This component should only be rendered in the browser')
  }

  return <div id="dynamic">Hello from the browser!</div>
}
