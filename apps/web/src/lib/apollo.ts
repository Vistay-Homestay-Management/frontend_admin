import { ApolloClient, HttpLink, InMemoryCache } from '@apollo/client'

const httpLink = new HttpLink({
  uri: import.meta.env.VITE_GRAPHQL_URL ?? 'http://localhost:8080/graphql',
  headers: {
    authorization: sessionStorage.getItem('vistay.accessToken')
      ? `Bearer ${sessionStorage.getItem('vistay.accessToken')}`
      : '',
  },
})

export const apolloClient = new ApolloClient({
  link: httpLink,
  cache: new InMemoryCache(),
})
