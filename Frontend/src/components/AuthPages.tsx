import React from 'react'
import { SignIn, SignUp } from '@clerk/react'

export const AuthPages: React.FC = () => {
  return (
    <>
      <SignIn path="/sign-in" routing="path" />
      <SignUp path="/sign-up" routing="path" />
    </>
  )
}

export default AuthPages
