import fs from 'fs'
import other from 'other'
const [a, b, ...rest] = fs.promises
const [foo, bar] = other
export async function getServerSideProps() {
  a
  b
  rest
  bar
}
