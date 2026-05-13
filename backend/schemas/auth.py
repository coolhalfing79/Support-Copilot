from uuid import UUID
from pydantic import BaseModel, EmailStr
from typing import Optional
from models.enums import UserRole

class UserRegister(BaseModel):
    username: str
    email: EmailStr
    password: str
    role: Optional[UserRole] = UserRole.agent

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class UserResponse(BaseModel):
    id: UUID
    username: str
    email: EmailStr
    role: UserRole

    class Config:
        from_attributes = True
